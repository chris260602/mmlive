import { Router, Request, Response } from "express";
import { roomJoinQueue } from "../bullmq";
import { transportQueue } from "../bullmq";
import { bullConnection } from "../bullmq";
import { QUEUE_CONFIG } from "../config/config";
import logger from "../logger";
import { cleanupQueueMetadata } from "../cleanup";
import { cleanupStaleJobs } from "../cleanup";
const Sentry = require("@sentry/node");

const router = Router();

router.get("/debug-sentry", (req: Request, res: Response) => {
  Sentry.logger.info("User triggered test error", {
    action: "test_error_endpoint",
  });
  throw new Error("My first Sentry error!");
});


router.get("/debug/queue-meta", async (req: Request, res: Response) => {
  try {
    const roomJoinMeta = await bullConnection.hgetall(
      `bull:${QUEUE_CONFIG.roomJoin.name}:meta`
    );
    const transportMeta = await bullConnection.hgetall(
      `bull:${QUEUE_CONFIG.transport.name}:meta`
    );

    const [roomJoinCounts, transportCounts] = await Promise.all([
      roomJoinQueue.getJobCounts(),
      transportQueue.getJobCounts(),
    ]);

    res.json({
      metadata: {
        roomJoin: roomJoinMeta,
        transport: transportMeta,
      },
      counts: {
        roomJoin: roomJoinCounts,
        transport: transportCounts,
      },
      // workers: {
      //   roomJoin: roomJoinWorker ? "active" : "null",
      //   transport: transportWorker ? "active" : "null",
      // },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== MANUAL FIX ENDPOINT =====

router.post("/debug/fix-queues", async (req: Request, res: Response) => {
  try {
    logger.info("Manual queue fix triggered");

    await cleanupQueueMetadata();
    await cleanupStaleJobs();

    // Resume queues
    await roomJoinQueue.resume();
    await transportQueue.resume();

    res.json({
      message: "Queue metadata cleaned and queues resumed",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("Error in manual fix", { error });
    res.status(500).json({ error: error.message });
  }
});

// ===== ALTERNATIVE: Nuclear option - flush all BullMQ data =====

router.post("/debug/flush-bullmq", async (req: Request, res: Response) => {
  try {
    logger.warn("FLUSHING ALL BULLMQ DATA - This will clear all jobs!");

    const keys = await bullConnection.keys("bull:*");
    if (keys.length > 0) {
      await bullConnection.del(...keys);
      logger.info(`Deleted ${keys.length} BullMQ keys`);
    }

    res.json({
      message: `Flushed ${keys.length} BullMQ keys`,
      keys: keys.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;