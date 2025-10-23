console.log("Starting server...");
require("dotenv").config();
require("./instrument");

import { Request, Response } from "express";
import { types as mediasoupTypes } from "mediasoup";
import { RouterRtpCodecCapability } from "mediasoup/node/lib/rtpParametersTypes";
import expressWinston from "express-winston";
import logger from "./logger";
import { UAParser } from "ua-parser-js";
import Redis from "ioredis";
import { Queue, Worker, QueueEvents } from "bullmq";
import routera from "./routes/health" 
import os from "os";
import { Router } from "mediasoup/node/lib/RouterTypes";
import { CONFIG, QUEUE_CONFIG } from "./config/config";
import { bullConnection, roomJoinQueueEvents, transportQueueEvents,roomJoinQueue, transportQueue } from "./bullmq";
import { redis, subscriber } from "./redis";
const Sentry = require("@sentry/node");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");

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


app.use(routera)





Sentry.setupExpressErrorHandler(app);

let workers: mediasoupTypes.Worker[] = [];
let nextWorkerIndex = 0;

let roomJoinWorker: Worker;
let transportWorker: Worker;

const localRouters = new Map<string, Router>();

const scanRedisKeys = async (pattern: string): Promise<string[]> => {
  const keys: string[] = [];
  let cursor = "0";

  do {
    const [newCursor, foundKeys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100 // Scan 100 keys at a time
    );
    cursor = newCursor;
    keys.push(...foundKeys);
  } while (cursor !== "0");

  return keys;
};

const getMediasoupWorker = () => {
  const worker = workers[nextWorkerIndex];
  if (++nextWorkerIndex === workers.length) nextWorkerIndex = 0;
  return worker;
};

// --- Worker Creation ---
const createWorkers = async () => {
  const numWorkers = Math.min(os.cpus().length, os.cpus().length - 1);
  logger.info(`Creating ${numWorkers} Mediasoup workers`);
  for (let i = 0; i < numWorkers; i++) {
    try {
      const worker = await mediasoup.createWorker({
        logLevel: "warn",
        rtcMinPort: CONFIG.mediasoup.rtcMinPort,
        rtcMaxPort: CONFIG.mediasoup.rtcMaxPort,
      });
      worker.on("died", async (error: any) => {
        logger.error(`Mediasoup worker died`, {
          workerPid: worker.pid,
          error: error.message,
        });
        Sentry.captureException(error, { tags: { workerPid: worker.pid } });
        const index = workers.indexOf(worker);
        if (index > -1) workers.splice(index, 1);
        if (workers.length < 1) await createReplacementWorker();
      });
      workers.push(worker);
    } catch (error) {
      logger.error(`Failed to create worker`, { workerIndex: i, error });
    }
  }
  if (workers.length === 0)
    throw new Error("Failed to create any MediaSoup workers");
};
const createReplacementWorker = async () => {
  try {
    const worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });
    worker.on("died", async () => {
      const index = workers.indexOf(worker);
      if (index > -1) workers.splice(index, 1);
      if (workers.length < 1) await createReplacementWorker();
    });
    workers.push(worker);
  } catch (error) {
    logger.error("Failed to create replacement worker:", error);
  }
};

// --- ROOM JOIN WORKER ---
const createRoomJoinWorker = () => {
  return new Worker(
    QUEUE_CONFIG.roomJoin.name,
    async (job) => {
      const { socketId, roomName, userData, peerId } =
        job.data as RoomJoinJobData;
      const startTime = Date.now();

      logger.info("Processing room join job", {
        jobId: job.id,
        socketId,
        roomName,
        peerId,
      });

      try {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) {
          return {
            success: false,
            error: "Socket disconnected before join completed",
          };
        }

        const existingRoom = await redis.get(`peer:${socketId}:room`);
        if (existingRoom) {
          logger.warn("Peer already in room, cleaning up", {
            socketId,
            existingRoom,
          });
          await cleanupPeer(socket);
        }

        const currentPeerCount = await redis.scard(`room:${roomName}:peers`);
        if (currentPeerCount >= CONFIG.room.maxPeersPerRoom) {
          return {
            success: false,
            error: "Room is full",
          };
        }

        const { router } = await getOrCreateRoom(roomName);

        socket.join(roomName);
        if (peerId) socket.join(peerId);

        const updatedUserData = { ...userData, peerId };

        const pipeline = redis.pipeline();
        pipeline.set(
          `peer:${socketId}:room`,
          roomName,
          "EX",
          CONFIG.redis.keyTTL.peer
        );
        pipeline.sadd(`room:${roomName}:peers`, socketId);
        pipeline.set(
          `peer:${socketId}:userData`,
          JSON.stringify(updatedUserData),
          "EX",
          CONFIG.redis.keyTTL.peer
        );
        await pipeline.exec();

        const producerKeys = await scanRedisKeys("producer:*:peer");
        const producersData = [];

        if (producerKeys.length > 0) {
          const producerSocketIds = await redis.mget(producerKeys);

          for (let i = 0; i < producerKeys.length; i++) {
            const producerSocketId = producerSocketIds[i];
            if (!producerSocketId) continue;

            const producerRoom = await redis.get(
              `peer:${producerSocketId}:room`
            );
            if (producerRoom === roomName) {
              const producerId = producerKeys[i].split(":")[1];
              const producerPeer = await getPeer(producerSocketId);
              if (producerPeer) {
                producersData.push({ producerId, userData: producerPeer });
              }
            }
          }
        }

        const duration = Date.now() - startTime;
        logger.info("Room join job successful", {
          jobId: job.id,
          socketId,
          roomName,
          peerId,
          producersCount: producersData.length,
          duration,
        });

        await publishToRoom(
          roomName,
          "peer-joined",
          { peerId, userData: updatedUserData },
          socketId
        );

        return {
          success: true,
          rtpCapabilities: router.rtpCapabilities,
          producersData,
        };
      } catch (error: any) {
        const duration = Date.now() - startTime;
        logger.error("Room join job failed", {
          jobId: job.id,
          socketId,
          roomName,
          error: error.message,
          stack: error.stack,
          duration,
        });

        return {
          success: false,
          error: error.message,
        };
      }
    },
    {
      connection: bullConnection,
      concurrency: QUEUE_CONFIG.roomJoin.concurrency,
      limiter: QUEUE_CONFIG.roomJoin.limiter,
      settings: {
        stalledInterval: 30000,
        maxStalledCount: 2,
      },
    }
  );
};

const createTransportWorker = () => {
  return new Worker(
    QUEUE_CONFIG.transport.name,
    async (job) => {
      const { socketId, isSender, routerId } = job.data as TransportJobData;
      const startTime = Date.now();

      try {
        logger.info("Starting transport creation job", {
          jobId: job.id,
          socketId,
          isSender,
          routerId,
        });

        const socket = io.sockets.sockets.get(socketId);
        if (!socket) {
          return {
            success: false,
            error: "Socket disconnected",
          };
        }

        const router = localRouters.get(routerId);
        if (!router) {
          return {
            success: false,
            error: "Router not found",
          };
        }

        const transport = await router.createWebRtcTransport({
          listenIps: [
            { ip: "0.0.0.0", announcedIp: process.env.MMLIVE_IP || undefined },
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          initialAvailableOutgoingBitrate: 1000000,
          minimumAvailableOutgoingBitrate: 600000,
          maxSctpMessageSize: 262144,
          maxIncomingBitrate: 1500000,
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            ...(process.env.TURN_SERVER &&
            process.env.TURN_USERNAME &&
            process.env.TURN_CREDENTIALS
              ? [
                  {
                    urls: `${process.env.TURN_SERVER}:3478?transport=udp`,
                    username: process.env.TURN_USERNAME,
                    credential: process.env.TURN_CREDENTIALS,
                    credentialType: "password",
                  },
                  {
                    urls: `${process.env.TURN_SERVER}:3478?transport=tcp`,
                    username: process.env.TURN_USERNAME,
                    credential: process.env.TURN_CREDENTIALS,
                    credentialType: "password",
                  },
                  {
                    urls: `${process.env.TURN_SERVER}:443?transport=tcp`,
                    username: process.env.TURN_USERNAME,
                    credential: process.env.TURN_CREDENTIALS,
                    credentialType: "password",
                  },
                ]
              : []),
          ],
        });

        // FIXED: Single timeout with proper cleanup
        let timeoutCleared = false;
        const transportTimeout = setTimeout(() => {
          if (!timeoutCleared && socket.data.transports.has(transport.id)) {
            logger.warn("Transport connection timeout", {
              transportId: transport.id,
              socketId: socket.id,
            });
            closeAndCleanTransport(socket, transport);
            socket.emit("transport-timeout", { transportId: transport.id });
          }
        }, CONFIG.cleanup.transportTimeout);

        // Helper to clear timeout once
        const clearTimeoutOnce = () => {
          if (!timeoutCleared) {
            clearTimeout(transportTimeout);
            timeoutCleared = true;
            logger.debug("Transport timeout cleared", {
              transportId: transport.id,
              socketId: socket.id,
            });
          }
        };

        // FIXED: Combined single ICE state listener
        transport.on("icestatechange", (iceState: string) => {
          logger.debug("ICE state change", {
            transportId: transport.id,
            state: iceState,
            socketId: socket.id,
          });

          if (iceState === "connected" || iceState === "completed") {
            clearTimeoutOnce();
            socket.emit("transport-ice-connected", {
              transportId: transport.id,
            });
          } else if (iceState === "disconnected") {
            logger.warn(`Transport ${transport.id} ICE disconnected`);
            socket.emit("transport-ice-disconnected", {
              transportId: transport.id,
            });
          } else if (iceState === "failed") {
            clearTimeoutOnce();
            logger.error("ICE connection failed", {
              transportId: transport.id,
              socketId: socket.id,
            });
            socket.emit("transport-ice-failed", { transportId: transport.id });
            closeAndCleanTransport(socket, transport);
          }
        });

        transport.on("dtlsstatechange", (dtlsState: string) => {
          logger.debug("DTLS state change", {
            transportId: transport.id,
            state: dtlsState,
            socketId: socket.id,
          });

          if (dtlsState === "connected") {
            clearTimeoutOnce();
          } else if (dtlsState === "closed" || dtlsState === "failed") {
            clearTimeoutOnce();
            if (dtlsState === "closed") {
              socket.emit("transport-closed", {
                transportId: transport.id,
                reason: "dtls-closed",
              });
            } else if (dtlsState === "failed") {
              socket.emit("transport-dtls-failed", {
                transportId: transport.id,
              });
            }
            closeAndCleanTransport(socket, transport);
          }
        });

        transport.on("routerclose", () => {
          clearTimeoutOnce();
          // closeAndCleanTransport(socket, transport);
        });

        socket.data.transports.set(transport.id, transport);

        const duration = Date.now() - startTime;
        logger.info("Transport creation job completed", {
          jobId: job.id,
          socketId,
          transportId: transport.id,
          duration,
        });

        return {
          success: true,
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        };
      } catch (error: any) {
        const duration = Date.now() - startTime;
        logger.error("Transport creation job failed", {
          jobId: job.id,
          socketId,
          error: error.message,
          stack: error.stack,
          duration,
        });

        return {
          success: false,
          error: error.message,
        };
      }
    },
    {
      connection: bullConnection,
      concurrency: QUEUE_CONFIG.transport.concurrency,
      limiter: QUEUE_CONFIG.transport.limiter,
      settings: {
        stalledInterval: 30000,
        maxStalledCount: 2,
      },
    }
  );
};

const initializeServer = async () => {
  try {
    logger.info("🚀 Starting server initialization...");
    await cleanupQueueMetadata();
    await cleanupStaleJobs();
    // 1. Create mediasoup workers first

    await createWorkers();
    logger.info("Mediasoup workers created");

    // 2. Create BullMQ workers (these will start processing jobs)
    roomJoinWorker = createRoomJoinWorker();
    transportWorker = createTransportWorker();

    await Promise.all([
      roomJoinQueue.resume().catch(() => logger.info('Queue already active')),
      transportQueue.resume().catch(() => logger.info('Queue already active')),
    ]);

    logger.info("Queue workers initialized", {
      roomJoin: QUEUE_CONFIG.roomJoin.name,
      transport: QUEUE_CONFIG.transport.name,
    });

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


// --- REDIS-BASED RESOURCE MANAGEMENT ---
const getPeer = async (socketId: string) => {
  const userDataStr = await redis.get(`peer:${socketId}:userData`);
  return userDataStr ? JSON.parse(userDataStr) : null;
};

const getRoomFromSocketId = async (socketId: string) => {
  const roomName = await redis.get(`peer:${socketId}:room`);
  if (!roomName) return { name: null, router: null };

  const routerId = await redis.hget(`room:${roomName}`, "routerId");
  if (!routerId) return { name: roomName, router: null };

  const router = localRouters.get(routerId);
  return { name: roomName, router };
};

const findPeerByProducerId = async (producerId: string) => {
  const socketId = await redis.get(`producer:${producerId}:peer`);
  if (!socketId) return null;
  return getPeer(socketId);
};

const getOrCreateRoom = async (roomName: string) => {
  const roomKey = `room:${roomName}`;
  try {
    let roomData = await redis.hgetall(roomKey);

    // Case 1: Room does not exist in Redis at all. Create everything new.
    if (!Object.keys(roomData).length) {
      logger.info(`Creating new room in Redis: ${roomName}`);
      const worker = getMediasoupWorker();
      if (!worker) throw new Error("No available MediaSoup workers");

      const mediaCodecs: RouterRtpCodecCapability[] = [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000,
          parameters: {
            "x-google-start-bitrate": 1000,
          },
        },
        {
          kind: "video",
          mimeType: "video/VP9",
          clockRate: 90000,
          parameters: {
            "profile-id": 2,
          },
        },
        {
          kind: "video",
          mimeType: "video/H264",
          clockRate: 90000,
          parameters: {
            "packetization-mode": 1,
            "profile-level-id": "4d0032",
            "level-asymmetry-allowed": 1,
          },
        },
      ];
      const newRouter = await worker.createRouter({ mediaCodecs });
      localRouters.set(newRouter.id, newRouter);
      await redis.hmset(roomKey, {
        routerId: newRouter.id,
        createdAt: new Date().toISOString(),
      });
      await redis.expire(roomKey, CONFIG.redis.keyTTL.room);

      return { router: newRouter };
    }

    // Case 2: Room exists in Redis. Try to find the live router in local memory.
    const existingRouter = localRouters.get(roomData.routerId);
    if (existingRouter) {
      return { router: existingRouter };
    }

    // Case 3 (The Fix): Room exists in Redis, but not in local memory (e.g., after a restart).
    // Create a new router and update Redis with its ID.
    logger.warn(
      `Found stale room in Redis. Re-creating router for: ${roomName}`
    );
    const worker = getMediasoupWorker();
    if (!worker) throw new Error("No available MediaSoup workers");

    const mediaCodecs: RouterRtpCodecCapability[] = [
      { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {
          "x-google-start-bitrate": 1000,
        },
      },
      {
        kind: "video",
        mimeType: "video/VP9",
        clockRate: 90000,
        parameters: {
          "profile-id": 2,
        },
      },
      {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters: {
          "packetization-mode": 1,
          "profile-level-id": "4d0032",
          "level-asymmetry-allowed": 1,
        },
      },
    ];
    const newRouterForStaleRoom = await worker.createRouter({ mediaCodecs });
    localRouters.set(newRouterForStaleRoom.id, newRouterForStaleRoom);
    await redis.hset(roomKey, "routerId", newRouterForStaleRoom.id); // Update the routerId for the existing room
    return { router: newRouterForStaleRoom };
  } catch (error) {
    logger.error("Error in getOrCreateRoom", { roomName, error });
    throw error;
  }
};

const cleanupPeer = async (socket: any) => {
  const socketId = socket.id;
  const startTime = Date.now();

  try {
    const roomName = await redis.get(`peer:${socketId}:room`);

    // --- THE FIX: Close all mediasoup resources for this peer ---
    // Closing the transports will automatically close all associated
    // producers and consumers, triggering the necessary events.
    if (socket.data.transports) {
      for (const transport of socket.data.transports.values()) {
        transport.close();
      }
    }

    // --- Producer Cleanup (for signaling other peers) ---
    // This part is still needed to notify other clients that producers are gone.
    // The actual server resource is freed by closing the transport above.
    if (socket.data.producers) {
      for (const producerId of socket.data.producers.keys()) {
        await redis.del(`producer:${producerId}:peer`);
        if (roomName) {
          const peer = await getPeer(socketId);
          await publishToRoom(
            roomName,
            "producer-closed",
            { producerId, peerId: peer?.peerId },
            socketId
          );
        }
      }
    }

    if (!roomName) return;
    await redis.srem(`room:${roomName}:peers`, socketId);

    // --- Room and Peer State Cleanup in Redis ---
    const peerCount = await redis.scard(`room:${roomName}:peers`);
    if (peerCount === 0) {
      logger.info(`Room ${roomName} is empty. Cleaning up.`);
      const routerId = await redis.hget(`room:${roomName}`, "routerId");
      if (routerId) {
        const router = localRouters.get(routerId);
        if (router) {
          router.close();
          localRouters.delete(routerId);
        }
      }
      await redis.del(`room:${roomName}`);
    } else {
      const peer = await getPeer(socketId);
      if (peer) {
        await publishToRoom(
          roomName,
          "peer-left",
          { peerId: peer.peerId },
          socketId
        );
      }
    }
    await redis.del(`peer:${socketId}:room`);
    await redis.del(`peer:${socketId}:userData`);

    const duration = Date.now() - startTime;
    logger.info("Peer cleanup completed", { socketId, duration });
  } catch (error) {
    logger.error("Error in cleanupPeer", { socketId, error });
    Sentry.captureException(error, {
      tags: { socketId, function: "cleanupPeer" },
    });
  }
};

const closeAndCleanTransport = async (
  socket: any,
  transport: mediasoupTypes.WebRtcTransport
): Promise<void> => {
  if (!transport) return;
  try {
    logger.info("Closing transport", {
      transportId: transport.id,
      socketId: socket.id,
    });

    const roomName = await redis.get(`peer:${socket.id}:room`);
    const peer = roomName ? await getPeer(socket.id) : null;

    // Clean up producers on this transport
    if (socket.data.producers) {
      for (const [producerId, producer] of socket.data.producers.entries()) {
        // Check if producer belongs to this transport
        if ((producer as any).transport?.id === transport.id) {
          try {
            await redis.del(`producer:${producerId}:peer`);

            if (roomName && peer) {
              await publishToRoom(
                roomName,
                "producer-closed",
                { producerId, peerId: peer.peerId },
                socket.id
              );
            }

            socket.data.producers.delete(producerId);
          } catch (error) {
            logger.error("Error cleaning producer on transport close", {
              producerId,
              error,
            });
          }
        }
      }
    }

    // Clean up consumers on this transport
    if (socket.data.consumers) {
      for (const [consumerId, consumer] of socket.data.consumers.entries()) {
        if ((consumer as any).transport?.id === transport.id) {
          socket.data.consumers.delete(consumerId);
        }
      }
    }

    transport.close();
    socket.data.transports.delete(transport.id);
  } catch (error) {
    logger.error("Error in closeAndCleanTransport", {
      transportId: transport.id,
      socketId: socket.id,
      error,
    });
    Sentry.captureException(error);
  }
};

// --- ORPHANED RESOURCE CLEANUP ---
const cleanupOrphanedResources = async () => {
  logger.info("Starting orphaned resource cleanup");
  const startTime = Date.now();

  try {
    // Find all producer keys
    const producerKeys = await scanRedisKeys("producer:*:peer");
    // console.log(producerKeys,"PROD KEYS")
    let orphanedProducers = 0;

    for (const key of producerKeys) {
      const socketId = await redis.get(key);
      if (!socketId) continue;
      // console.log(socketId,"socket ID")

      // Check if peer still exists
      const peerExists = await redis.exists(`peer:${socketId}:userData`);
      if (!peerExists) {
        await redis.del(key);
        orphanedProducers++;
      }
    }
    // Find all peer keys and check for orphaned data
    const peerRoomKeys = await scanRedisKeys("peer:*:room");
    // console.log(peerRoomKeys,"pir rom keys")
    let orphanedPeers = 0;

    for (const key of peerRoomKeys) {
      const socketId = key.split(":")[1];
      const userDataExists = await redis.exists(`peer:${socketId}:userData`);

      if (!userDataExists) {
        await redis.del(key);
        await redis.del(`peer:${socketId}:userData`);
        orphanedPeers++;
      }
    }

    // Clean up empty rooms
    const roomKeys = await scanRedisKeys("room:*");
    // console.log(roomKeys,"rom keys")
    let emptyRooms = 0;

    for (const roomKey of roomKeys) {
      if (roomKey.includes(":peers")) continue;

      const roomName = roomKey.replace("room:", "");
      const peerCount = await redis.scard(`room:${roomName}:peers`);

      if (peerCount === 0) {
        const routerId = await redis.hget(roomKey, "routerId");
        if (routerId) {
          const router = localRouters.get(routerId);
          if (router) {
            try {
              router.close();
              localRouters.delete(routerId);
            } catch (error) {
              logger.error("Error closing orphaned router", {
                roomName,
                error,
              });
            }
          }
        }
        await redis.del(roomKey);
        await redis.del(`room:${roomName}:peers`);
        emptyRooms++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info("Orphaned resource cleanup completed", {
      orphanedProducers,
      orphanedPeers,
      emptyRooms,
      duration,
    });
  } catch (error) {
    logger.error("Error in orphaned resource cleanup", { error });
    Sentry.captureException(error);
  }
};

const cleanupQueueMetadata = async () => {
  try {
    logger.info("Cleaning up BullMQ metadata from previous server instance...");

    // CRITICAL: Delete meta keys for all queues
    const metaKeys = [
      `bull:${QUEUE_CONFIG.roomJoin.name}:meta`,
      `bull:${QUEUE_CONFIG.transport.name}:meta`,
    ];

    for (const key of metaKeys) {
      const deleted = await bullConnection.del(key);
      if (deleted > 0) {
        logger.info(`✅ Deleted stale metadata: ${key}`);
      }
    }

    // Also clean up other potentially problematic keys
    const keysToClean = [
      // Worker registration keys
      `bull:${QUEUE_CONFIG.roomJoin.name}:workers`,
      `bull:${QUEUE_CONFIG.transport.name}:workers`,
      // Lock keys
      `bull:${QUEUE_CONFIG.roomJoin.name}:lock`,
      `bull:${QUEUE_CONFIG.transport.name}:lock`,
      // Stalled check keys
      `bull:${QUEUE_CONFIG.roomJoin.name}:stalled-check`,
      `bull:${QUEUE_CONFIG.transport.name}:stalled-check`,
    ];

    for (const key of keysToClean) {
      await bullConnection.del(key).catch(() => {}); // Ignore errors
    }

    logger.info("✅ Queue metadata cleanup completed");
  } catch (error) {
    logger.error("Error cleaning up queue metadata", { error });
  }
};

const cleanupStaleJobs = async () => {
  try {
    logger.info(
      "Cleaning up stale BullMQ data from previous server instance..."
    );

    // Clean both queues
    const queues = [roomJoinQueue, transportQueue];

    for (const queue of queues) {
      // Get all jobs in problematic states
      const [prioritizedJobs, waitingJobs, activeJobs, delayedJobs] =
        await Promise.all([
          queue.getJobs(["prioritized"]),
          queue.getJobs(["waiting"]),
          queue.getJobs(["active"]),
          queue.getJobs(["delayed"]),
        ]);

      const allStaleJobs = [
        ...prioritizedJobs,
        ...waitingJobs,
        ...activeJobs,
        ...delayedJobs,
      ];

      logger.info(`Found ${allStaleJobs.length} stale jobs in ${queue.name}`);

      for (const job of allStaleJobs) {
        try {
          await job.remove();
        } catch (err) {
                  logger.warn('Failed to remove stale job', { jobId: job.id, error: err });

          // Job might already be processed, ignore
        }
      }
    }

    // CRITICAL: Clean up stale worker registrations
    // BullMQ stores worker info in Redis keys like "bull:queue-name:workers"
    const workerKeys = await bullConnection.keys("bull:*:workers");
    for (const key of workerKeys) {
      try {
        await bullConnection.del(key);
        logger.info(`Removed stale worker key: ${key}`);
      } catch (err) {
        logger.error("Error removing worker key", { key, error: err });
      }
    }

    // Clean up stale locks
    const lockKeys = await bullConnection.keys("bull:*:lock");
    for (const key of lockKeys) {
      try {
        await bullConnection.del(key);
        logger.info(`Removed stale lock: ${key}`);
      } catch (err) {
        logger.error("Error removing lock", { key, error: err });
      }
    }

    logger.info("Stale BullMQ data cleanup completed");
  } catch (error) {
    logger.error("Error cleaning up stale jobs", { error });
  }
};

// Start periodic cleanup
setInterval(cleanupOrphanedResources, CONFIG.cleanup.orphanCheckInterval);

// --- REDIS PUB/SUB FOR SIGNALING ---
const GLOBAL_CHANNEL = "room-events";

subscriber.subscribe(GLOBAL_CHANNEL, (err) => {
  if (err) {
    logger.error("Failed to subscribe to Redis channel", { error: err });
    Sentry.captureException(err);
  } else {
    logger.info(`Subscribed to Redis channel: ${GLOBAL_CHANNEL}`);
  }
});

subscriber.on("message", (channel, message) => {
  if (channel !== GLOBAL_CHANNEL) return;
  try {
    const { event, roomName, socketIdToExclude, data } = JSON.parse(message);
    const target = socketIdToExclude
      ? io.to(roomName).except(socketIdToExclude)
      : io.to(roomName);
    target.emit(event, data);
  } catch (error) {
    logger.error("Error parsing Redis message", { error });
  }
});

async function publishToRoom(
  roomName: string,
  event: string,
  data: any,
  socketIdToExclude: string | null = null
) {
  const message = JSON.stringify({ roomName, event, data, socketIdToExclude });
  await redis.publish(GLOBAL_CHANNEL, message);
}

// --- Socket.IO Connection Handling ---
io.on("connection", (socket: any) => {
  const userAgentString = socket.handshake.headers["user-agent"];
  const parser = new UAParser(userAgentString);
  const result = parser.getResult();
  socket.clientInfo = {
    browser: `${result.browser.name || "Unknown"} ${
      result.browser.version || ""
    }`.trim(),
    os: `${result.os.name || "Unknown"} ${result.os.version || ""}`.trim(),
    device: result.device.vendor
      ? `${result.device.vendor} ${result.device.model}`
      : "Desktop",
  };
  logger.info("Client connected", {
    socketId: socket.id,
    ip: socket.handshake.address,
    ...socket.clientInfo,
  });

  socket.data.transports = new Map();
  socket.data.producers = new Map();
  socket.data.consumers = new Map();

  socket.on("disconnect", async (reason: string) => {
    logger.info("Client disconnected", { socketId: socket.id, reason });

    try {
      const [roomJobs, transportJobs] = await Promise.all([
        roomJoinQueue.getJobs(["waiting", "active", "delayed"]),
        transportQueue.getJobs(["waiting", "active", "delayed"]),
      ]);

      const jobsToRemove = [
        ...roomJobs.filter((job) => job.data.socketId === socket.id),
        ...transportJobs.filter((job) => job.data.socketId === socket.id),
      ];

      await Promise.all(jobsToRemove.map((job) => job.remove()));

      logger.info("Removed pending jobs for disconnected socket", {
        socketId: socket.id,
        removedCount: jobsToRemove.length,
      });
    } catch (error) {
      logger.error("Error removing jobs on disconnect", {
        socketId: socket.id,
        error,
      });
    }
    await cleanupPeer(socket);
  });

  socket.on("leaveRoom", async () => {
    await cleanupPeer(socket);
  });

  socket.on(
    "refresh-student-server",
    async ({ peerId, userId }: { peerId: string; userId: string }) => {
      if (peerId)
        socket.to(peerId).emit("refresh-student-client", { peerId, userId });
    }
  );
  socket.on(
    "kick-student-server",
    async ({ peerId, userId }: { peerId: string; userId: string }) => {
      if (peerId)
        socket.to(peerId).emit("kick-student-client", { peerId, userId });
    }
  );

  socket.on(
    "joinRoom",
    async (
      {
        roomName,
        userData,
        peerId,
      }: {
        peerId: string;
        userData: object;
        roomName: string;
      },
      callback: Function
    ) => {
      try {
        logger.info("Join room request received", {
          socketId: socket.id,
          roomName,
          peerId,
        });

        // Add job to queue
        const job = await roomJoinQueue.add(
          "join-room",
          {
            socketId: socket.id,
            roomName,
            userData,
            peerId,
          },
          {
            jobId: `join-${socket.id}-${Date.now()}`,
            priority: 1,
            // timeout: 30000,
          }
        );

        logger.info("Room join job queued", {
          jobId: job.id,
          socketId: socket.id,
          roomName,
        });

        // Wait for job completion with extended timeout and retries
        try {
          const result = await job.waitUntilFinished(
            roomJoinQueueEvents,
            45000
          ); // Increased from 30s to 45s

          if (result.success) {
            callback({
              rtpCapabilities: result.rtpCapabilities,
              producersData: result.producersData,
            });
          } else {
            callback({ error: result.error || "Failed to join room" });
          }
        } catch (waitError: any) {
          // If waitUntilFinished times out, check job status manually
          logger.warn("Wait timed out, checking job status manually", {
            jobId: job.id,
            socketId: socket.id,
          });

          const jobState = await job.getState();

          if (jobState === "completed") {
            // Job completed but notification was missed
            const result = await job.returnvalue;
            logger.info("Job completed, notification was delayed", {
              jobId: job.id,
              socketId: socket.id,
            });

            if (result.success) {
              callback({
                rtpCapabilities: result.rtpCapabilities,
                producersData: result.producersData,
              });
            } else {
              callback({ error: result.error || "Failed to join room" });
            }
          } else if (jobState === "failed") {
            const failedReason = job.failedReason || "Unknown error";
            logger.error("Job failed", { jobId: job.id, failedReason });
            callback({ error: failedReason });
          } else {
            // Job is still processing or stuck
            logger.error("Job still processing or stuck", {
              jobId: job.id,
              state: jobState,
            });
            callback({ error: "Request timeout - please try again" });
          }
        }
      } catch (e: any) {
        logger.error("Failed to queue room join", {
          roomName,
          peerId,
          socketId: socket.id,
          error: e.message,
          stack: e.stack,
        });
        Sentry.captureException(e, {
          tags: { socketId: socket.id, roomName, peerId },
        });
        callback({ error: e.message || "Failed to join room" });
      }
    }
  );

  socket.on(
    "createWebRtcTransport",
    async ({ isSender }: { isSender: boolean }, callback: Function) => {
      try {
        const roomData = await getRoomFromSocketId(socket.id);
        if (!roomData.router) {
          return callback({ error: "Not in a room" });
        }

        logger.debug("Creating WebRTC transport via queue", {
          socketId: socket.id,
          isSender,
        });

        const job = await transportQueue.add(
          "create-transport",
          {
            socketId: socket.id,
            isSender,
            routerId: roomData.router.id,
          },
          {
            jobId: `transport-${socket.id}-${Date.now()}`,
            priority: isSender ? 1 : 2,
            timeout: 20000,
          }
        );

        logger.info("Transport creation job queued", {
          jobId: job.id,
          socketId: socket.id,
          isSender,
        });

        // Use persistent transportQueueEvents instead of creating new one
        try {
          const result = await job.waitUntilFinished(
            transportQueueEvents,
            30000
          ); // Increased timeout

          if (result.success) {
            callback({ params: result.params });
          } else {
            callback({ error: result.error || "Failed to create transport" });
          }
        } catch (waitError: any) {
          // Manual status check on timeout
          logger.warn("Transport wait timed out, checking job status", {
            jobId: job.id,
            socketId: socket.id,
          });

          const jobState = await job.getState();

          if (jobState === "completed") {
            const result = await job.returnvalue;
            logger.info("Transport job completed, notification delayed", {
              jobId: job.id,
              socketId: socket.id,
            });

            if (result.success) {
              callback({ params: result.params });
            } else {
              callback({ error: result.error || "Failed to create transport" });
            }
          } else if (jobState === "failed") {
            const failedReason = job.failedReason || "Unknown error";
            logger.error("Transport job failed", {
              jobId: job.id,
              failedReason,
            });
            callback({ error: failedReason });
          } else {
            logger.error("Transport job stuck", {
              jobId: job.id,
              state: jobState,
            });
            callback({
              error: "Transport creation timeout - please try again",
            });
          }
        }
      } catch (e: any) {
        logger.error("Failed to queue transport creation", {
          socketId: socket.id,
          error: e.message,
          stack: e.stack,
        });
        Sentry.captureException(e, {
          tags: { socketId: socket.id, action: "createWebRtcTransport" },
        });
        callback({ error: e.message });
      }
    }
  );

  socket.on(
    "connectTransport",
    async ({ transportId, dtlsParameters }, callback) => {
      try {
        const transport = socket.data.transports.get(transportId);
        if (!transport) throw new Error(`Transport not found`);
        logger.debug("Connecting transport", {
          transportId,
          socketId: socket.id,
        });
        await transport.connect({ dtlsParameters });
        logger.info("Transport connected", {
          transportId,
          socketId: socket.id,
        });
        callback({});
      } catch (e: any) {
        logger.error("Failed to connect transport", {
          transportId,
          socketId: socket.id,
          error: e.message,
        });
        callback({ error: e.message });
      }
    }
  );

  socket.on(
    "produce",
    async ({ kind, rtpParameters, transportId, roomName }, callback) => {
      try {
        const transport = socket.data.transports.get(transportId);
        if (!transport) return callback({ error: `Transport not found` });
        const producer = await transport.produce({ kind, rtpParameters });

        socket.data.producers.set(producer.id, producer);
        await redis.set(
          `producer:${producer.id}:peer`,
          socket.id,
          "EX",
          CONFIG.redis.keyTTL.producer
        );

        producer.on("transportclose", () => {
          logger.info("Producer transport closed", {
            producerId: producer.id,
            socketId: socket.id,
          });
          socket.data.producers.delete(producer.id);
          redis.del(`producer:${producer.id}:peer`).catch((err) => {
            logger.error("Error deleting producer from Redis", {
              producerId: producer.id,
              error: err,
            });
          });
        });

        producer.on("score", (score) => {
          logger.debug("Producer score", {
            producerId: producer.id,
            score,
          });
        });

        const peer = await getPeer(socket.id);
        await publishToRoom(
          roomName,
          "new-producer",
          { producerId: producer.id, userData: peer, kind },
          socket.id
        );

        callback({ id: producer.id });
      } catch (e: any) {
        logger.error("Failed to create producer", {
          kind,
          transportId,
          socketId: socket.id,
          error: e.message,
          stack: e.stack,
        });
        Sentry.captureException(e, {
          tags: { socketId: socket.id, action: "produce" },
        });
        callback({ error: e.message });
      }
    }
  );

  socket.on(
    "consume",
    async ({ transportId, producerId, rtpCapabilities }, callback) => {
      try {
        const { router } = await getRoomFromSocketId(socket.id);
        const transport = socket.data.transports.get(transportId);
        if (!router || !transport)
          return callback({ error: "Router or Transport not found" });

        if (!router.canConsume({ producerId, rtpCapabilities })) {
          logger.warn("Cannot consume", { producerId, socketId: socket.id });
          return callback({ error: "Cannot consume" });
        }

        const producingPeer = await findPeerByProducerId(producerId);
        if (!producingPeer)
          return callback({ error: "Producing peer not found" });

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
        });
        socket.data.consumers.set(consumer.id, consumer);

        consumer.on("producerclose", () => {
          socket.data.consumers.delete(consumer.id);
          socket.emit("consumer-closed", { consumerId: consumer.id });
        });
        consumer.on("producerpause", () => {
          socket.emit("consumer-producer-paused", { consumerId: consumer.id });
        });

        consumer.on("producerresume", () => {
          socket.emit("consumer-producer-resumed", { consumerId: consumer.id });
        });
        consumer.on("transportclose", () => {
          socket.data.consumers.delete(consumer.id);
        });

        callback({
          params: {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            userData: producingPeer,
          },
        });
      } catch (error: any) {
        logger.error("Failed to create consumer", {
          producerId,
          transportId,
          socketId: socket.id,
          error: error.message,
          stack: error.stack,
        });
        Sentry.captureException(error, {
          tags: { socketId: socket.id, action: "consume" },
        });
        callback({ error: error.message });
      }
    }
  );

  socket.on("resume", async ({ consumerId }, callback) => {
    try {
      const consumer = socket.data.consumers.get(consumerId);
      if (!consumer) {
        logger.warn("Consumer not found for resume", {
          consumerId,
          socketId: socket.id,
        });
        if (callback) callback({ error: "Consumer not found" });
        return;
      }

      await consumer.resume();

      logger.debug("Consumer resumed", { consumerId, socketId: socket.id });

      if (callback) callback({});
    } catch (error: any) {
      logger.error("Error resuming consumer", {
        consumerId,
        socketId: socket.id,
        error: error.message,
      });
      if (callback) callback({ error: error.message });
    }
  });

  socket.on("pauseProducer", async ({ producerId }, callback) => {
    try {
      const producer = socket.data.producers.get(producerId);
      if (!producer) {
        logger.warn("Producer not found for pause", {
          producerId,
          socketId: socket.id,
        });
        if (callback) callback({ error: "Producer not found" });
        return;
      }

      await producer.pause();

      logger.info("Producer paused", { producerId, socketId: socket.id });

      const roomName = await redis.get(`peer:${socket.id}:room`);
      if (roomName) {
        const peer = await getPeer(socket.id);
        await publishToRoom(
          roomName,
          "producer-paused",
          { producerId, peerId: peer?.peerId },
          socket.id
        );
      }

      if (callback) callback({});
    } catch (error: any) {
      logger.error("Error pausing producer", {
        producerId,
        socketId: socket.id,
        error: error.message,
      });
      if (callback) callback({ error: error.message });
    }
  });

  // --- RESUME PRODUCER HANDLER ---
  socket.on("resumeProducer", async ({ producerId }, callback) => {
    try {
      const producer = socket.data.producers.get(producerId);
      if (!producer) {
        logger.warn("Producer not found for resume", {
          producerId,
          socketId: socket.id,
        });
        if (callback) callback({ error: "Producer not found" });
        return;
      }

      await producer.resume();

      logger.info("Producer resumed", { producerId, socketId: socket.id });

      const roomName = await redis.get(`peer:${socket.id}:room`);
      if (roomName) {
        const peer = await getPeer(socket.id);
        await publishToRoom(
          roomName,
          "producer-resumed",
          { producerId, peerId: peer?.peerId },
          socket.id
        );
      }

      if (callback) callback({});
    } catch (error: any) {
      logger.error("Error resuming producer", {
        producerId,
        socketId: socket.id,
        error: error.message,
      });
      if (callback) callback({ error: error.message });
    }
  });

  // --- CLOSE PRODUCER HANDLER ---
  socket.on("closeProducer", async ({ producerId }, callback) => {
    try {
      const producer = socket.data.producers.get(producerId);
      if (!producer) {
        logger.warn("Producer not found for close", {
          producerId,
          socketId: socket.id,
        });
        if (callback) callback({ error: "Producer not found" });
        return;
      }

      const roomName = await redis.get(`peer:${socket.id}:room`);

      producer.close();
      socket.data.producers.delete(producerId);
      await redis.del(`producer:${producerId}:peer`);

      logger.info("Producer closed", { producerId, socketId: socket.id });

      if (roomName) {
        const peer = await getPeer(socket.id);
        await publishToRoom(
          roomName,
          "producer-closed",
          { producerId, peerId: peer?.peerId },
          socket.id
        );
      }

      if (callback) callback({});
    } catch (error: any) {
      logger.error("Error closing producer", {
        producerId,
        socketId: socket.id,
        error: error.message,
      });
      if (callback) callback({ error: error.message });
    }
  });

  // --- GET PRODUCER STATS HANDLER ---
  socket.on("getProducerStats", async ({ producerId }, callback) => {
    try {
      console.log(socket.data.producers, "HAIII");
      const producer = socket.data.producers.get(producerId);
      if (!producer) {
        if (callback) callback({ error: "Producer not found" });
        return;
      }

      const stats = await producer.getStats();
      if (callback) callback({ stats: Array.from(stats) });
    } catch (error: any) {
      logger.error("Error getting producer stats", {
        producerId,
        socketId: socket.id,
        error: error.message,
      });
      if (callback) callback({ error: error.message });
    }
  });

  // --- GET CONSUMER STATS HANDLER ---
  socket.on("getConsumerStats", async ({ consumerId }, callback) => {
    try {
      const consumer = socket.data.consumers.get(consumerId);
      if (!consumer) {
        if (callback) callback({ error: "Consumer not found" });
        return;
      }

      const stats = await consumer.getStats();
      if (callback) callback({ stats: Array.from(stats) });
    } catch (error: any) {
      logger.error("Error getting consumer stats", {
        consumerId,
        socketId: socket.id,
        error: error.message,
      });
      if (callback) callback({ error: error.message });
    }
  });
});


// --- JOB INTERFACES ---
interface RoomJoinJobData {
  socketId: string;
  roomName: string;
  userData: any;
  peerId: string;
}

interface TransportJobData {
  socketId: string;
  isSender: boolean;
  routerId: string;
}
const cleanupDisconnectedPeerMaps = () => {
  logger.info("Peer Cleanup started");

  let cleaned = { transports: 0, producers: 0, consumers: 0 };

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.transports) {
      for (const [id, transport] of socket.data.transports.entries()) {
        if ((transport as any)._closed) {
          socket.data.transports.delete(id);
          cleaned.transports++;
        }
      }
    }

    if (socket.data.producers) {
      for (const [id, producer] of socket.data.producers.entries()) {
        if ((producer as any)._closed) {
          socket.data.producers.delete(id);
          cleaned.producers++;
        }
      }
    }

    if (socket.data.consumers) {
      for (const [id, consumer] of socket.data.consumers.entries()) {
        if ((consumer as any)._closed) {
          socket.data.consumers.delete(id);
          cleaned.consumers++;
        }
      }
    }
  }

  if (cleaned.transports + cleaned.producers + cleaned.consumers > 0) {
    logger.info("Cleaned up closed resources", cleaned);
  }
  // Clean memory cache
};

setInterval(cleanupDisconnectedPeerMaps, CONFIG.cleanup.memoryCleanupInterval);

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
        Sentry.captureMessage("High number of failed room join jobs", {
          level: "warning",
          extra: { counts: roomJoinCounts },
        });
      }
    } catch (error) {
      logger.error("Error monitoring queues", { error });
    }
  }, 60000); // Every minute
};

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress, forcing exit...");
    process.exit(1);
  }

  isShuttingDown = true;
  logger.warn(`Received ${signal}, shutting down gracefully...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timeout, forcing exit");
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // 1. Stop accepting new Socket.IO connections
    io.close(() => {
      logger.info("Socket.IO server closed");
    });

    // 2. Pause queues (stop accepting new jobs)
    logger.info("Closing queues...");
    await Promise.all([roomJoinQueue.close(), transportQueue.close()]);
    logger.info("✅ Queues closed");

    // 3. Wait for active jobs to complete (with timeout)
    logger.info("Waiting for active jobs to complete...");
    const maxWait = 20000; // 20 seconds
    const startWait = Date.now();

    while (Date.now() - startWait < maxWait) {
      const [roomJoinCounts, transportCounts] = await Promise.all([
        roomJoinQueue.getJobCounts(),
        transportQueue.getJobCounts(),
      ]);

      if (roomJoinCounts.active === 0 && transportCounts.active === 0) {
        logger.info("✅ All active jobs completed");
        break;
      }

      logger.info("Waiting for jobs...", {
        roomJoinActive: roomJoinCounts.active,
        transportActive: transportCounts.active,
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 4. Close workers gracefully
    logger.info("Closing workers...");
    if (roomJoinWorker) {
      await roomJoinWorker.close();
      logger.info("✅ Room join worker closed");
    }
    if (transportWorker) {
      await transportWorker.close();
      logger.info("✅ Transport worker closed");
    }

    // 5. Close queue events
    logger.info("Closing queue events...");
    await transportQueueEvents.close();
    await roomJoinQueueEvents.close();
    logger.info("✅ Queue events closed");

    // 6. Close queues (this also cleans up Redis worker registrations)
    logger.info("Closing queues...");
    await roomJoinQueue.close();
    await transportQueue.close();
    logger.info("✅ Queues closed");

    // 7. Close mediasoup workers
    logger.info("Closing mediasoup workers...");
    await Promise.all(workers.map((w) => w.close()));
    logger.info("✅ Mediasoup workers closed");

    // 8. Close Redis connections
    logger.info("Closing Redis connections...");
    await redis.quit();
    await subscriber.quit();
    await bullConnection.quit();
    logger.info("✅ Redis connections closed");

    clearTimeout(shutdownTimeout);

    // 9. Close HTTP server
    server.close(() => {
      logger.info("✅ HTTP server closed");
      logger.info("🎉 Graceful shutdown completed successfully");
      process.exit(0);
    });

    // Force close after 5 seconds
    setTimeout(() => {
      logger.warn("Forcing server close");
      process.exit(0);
    }, 5000);
  } catch (error) {
    logger.error("Error during graceful shutdown", { error });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

// --- GRACEFUL SHUTDOWN ---
export const closeQueues = async () => {
  await Promise.all([
    roomJoinQueue.close(),
    transportQueue.close(),
    roomJoinQueueEvents.close(),
  ]);
  logger.info("All queues closed");
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

// Handle uncaught errors
process.on("uncaughtException", async(error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  Sentry.captureException(error);
  await gracefulShutdown('uncaughtException');
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { reason, promise });
  Sentry.captureException(reason);
});

initializeServer();