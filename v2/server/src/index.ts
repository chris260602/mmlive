console.log("Starting server...");
require("dotenv").config();
require("./instrument");

import { Request, Response } from "express";
import expressWinston from "express-winston";
import logger from "./logger";
import { Worker } from "bullmq";
import routera from "./routes/health";
import { CONFIG, QUEUE_CONFIG } from "./config/config";
import { roomJoinQueue, transportQueue } from "./bullmq";
import { initializeRedisPubSub } from "./redis";
import { gracefulShutdown } from "./shutdown";
import { createWorkers, workers } from "./mediasoup";
import { createRoomJoinWorker } from "./workers/roomJoin";
import {
  cleanupDisconnectedPeerMaps,
  cleanupOrphanedResources,
  cleanupQueueMetadata,
  cleanupStaleJobs,
} from "./cleanup";
import { createTransportWorker } from "./workers/transport";
import { initializeSocketIO } from "./socket/handler";
import metricsRoute from "./routes/metrics"
import debugRoute from "./routes/debug"
import { isLocal } from "./utils/envUtils";
const Sentry = require("@sentry/node");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

logger.info("Server started");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(
  expressWinston.logger({
    winstonInstance: logger,
    meta: true,
    msg: "HTTP {{req.method}} {{req.url}}",
    expressFormat: true,
    colorize: false,
    ignoreRoute: (req, res) => req.url === "/health",
  })
);

// --- Express Routes ---
app.get("/", (req: Request, res: Response) => {
  res.send("MM LIVE server is running");
});

app.use(metricsRoute);
app.use(debugRoute);
app.use(routera);

Sentry.setupExpressErrorHandler(app);

let roomJoinWorker: Worker;
let transportWorker: Worker;

const initializeServer = async () => {
  try {
    logger.info("🚀 Starting server initialization...");
    await cleanupQueueMetadata();
    await cleanupStaleJobs();
    // 1. Create mediasoup workers first

    await createWorkers();
    logger.info("Mediasoup workers created");

    // 2. Create BullMQ workers (these will start processing jobs)
    roomJoinWorker = createRoomJoinWorker({ io });
    transportWorker = createTransportWorker({ io });

    await Promise.all([
      roomJoinQueue.resume().catch(() => logger.info("Queue already active")),
      transportQueue.resume().catch(() => logger.info("Queue already active")),
    ]);

    logger.info("Queue workers initialized", {
      roomJoin: QUEUE_CONFIG.roomJoin.name,
      transport: QUEUE_CONFIG.transport.name,
    });

    // --- Socket.IO Connection Handling ---
    initializeSocketIO(io);
    // --- REDIS PUB/SUB FOR SIGNALING ---
    initializeRedisPubSub(io);

    // 3. Start monitoring
    monitorQueues();

    // 4. Start the HTTP server
    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      logger.info(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to initialize server", { error });
    process.exit(1);
  }
};

// Start periodic cleanup
setInterval(cleanupOrphanedResources, CONFIG.cleanup.orphanCheckInterval);
setInterval(
  () => cleanupDisconnectedPeerMaps(io),
  CONFIG.cleanup.memoryCleanupInterval
);

// --- QUEUE HEALTH MONITORING ---
const monitorQueues = () => {
  setInterval(async () => {
    try {
      const [roomJoinCounts, transportCounts] = await Promise.all([
        roomJoinQueue.getJobCounts(),
        transportQueue.getJobCounts(),
      ]);

      logger.info("Queue metrics", {
        roomJoin: roomJoinCounts,
        transport: transportCounts,
      });

      // Alert if too many failed jobs
      if (roomJoinCounts.failed > 100) {
        if(!isLocal())Sentry.captureMessage("High number of failed room join jobs", {
          level: "warning",
          extra: { counts: roomJoinCounts },
        });
      }
    } catch (error) {
      logger.error("Error monitoring queues", { error });
    }
  }, 60000); // Every minute
};

process.on("SIGINT", () =>
  gracefulShutdown({
    signal: "SIGINT",
    io,
    roomJoinWorker,
    transportWorker,
    server,
    workers: workers,
  })
);
process.on("SIGTERM", () =>
  gracefulShutdown({
    signal: "SIGTERM",
    io,
    roomJoinWorker,
    transportWorker,
    server,
    workers: workers,
  })
);
process.on("SIGHUP", () =>
  gracefulShutdown({
    signal: "SIGHUP",
    io,
    roomJoinWorker,
    transportWorker,
    server,
    workers: workers,
  })
);

// Handle uncaught errors
process.on("uncaughtException", async (error) => {
  logger.error("Uncaught exception", {
    error: error.message,
    stack: error.stack,
  });
  if(!isLocal())Sentry.captureException(error);
  await gracefulShutdown({
    signal: "uncaughtException",
    io,
    roomJoinWorker,
    transportWorker,
    server,
    workers: workers,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { reason, promise });
  if(!isLocal())Sentry.captureException(reason);
});

initializeServer();
