import Redis from "ioredis";
import { QUEUE_CONFIG } from "./config/config";
import logger from "./logger";
import { Queue, QueueEvents } from "bullmq";
import { isLocal } from "./utils/envUtils";


export interface RoomJoinJobData {
  socketId: string;
  roomName: string;
  userData: any;
  peerId: string;
}

export interface TransportJobData {
  socketId: string;
  isSender: boolean;
  routerId: string;
}

export const bullConnection = new Redis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
  {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
    // Improve connection stability
    connectTimeout: 10000,
    maxLoadingRetryTime: 5000,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  }
);


export const transportQueueEvents = new QueueEvents(QUEUE_CONFIG.transport.name, {
  connection: bullConnection,
});

export const roomJoinQueueEvents = new QueueEvents(QUEUE_CONFIG.roomJoin.name, {
  connection: bullConnection,
});

transportQueueEvents.on("error", (err) => {
  logger.error("Transport queue events error", { error: err.message });
});

roomJoinQueueEvents.on("error", (err) => {
  logger.error("Room join queue events error", { error: err.message });
});

roomJoinQueueEvents.on("completed", ({ jobId }) => {
  logger.info("Room join completed", { jobId });
});

roomJoinQueueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error("Room join failed", { jobId, error: failedReason });
  if(!isLocal())Sentry.captureMessage("Room join job failed", {
    level: "error",
    extra: { jobId, failedReason },
  });
});

transportQueueEvents.on("completed", ({ jobId }) => {
  logger.info("Transport creation completed", { jobId });
});

transportQueueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error("Transport creation failed", { jobId, error: failedReason });
});

export const roomJoinQueue = new Queue(QUEUE_CONFIG.roomJoin.name, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 6 * 3600,
      count: 2,
    },
    removeOnFail: {
      age: 2 * 3600,
    },
  },
});

export const transportQueue = new Queue(QUEUE_CONFIG.transport.name, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      age: 1800,
      count: 4,
    },
  },
});