import Redis from "ioredis";
import logger from "./logger";
import { GLOBAL_CHANNEL } from "./config/config";
import { Server } from "socket.io";
import { isLocal } from "./utils/envUtils";

export const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});
export const subscriber = new Redis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
  {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  }
);

redis.on("error", (err) => {
  logger.error("Redis client error", { error: err.message });
  if(!isLocal())Sentry.captureException(err);
});

subscriber.on("error", (err) => {
  logger.error("Redis subscriber error", { error: err.message });
  if(!isLocal())Sentry.captureException(err);
});

logger.info("Connected to Redis");


export const scanRedisKeys = async (pattern: string): Promise<string[]> => {
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


export async function publishToRoom(
  roomName: string,
  event: string,
  data: any,
  socketIdToExclude: string | null = null
) {
  const message = JSON.stringify({ roomName, event, data, socketIdToExclude });
  await redis.publish(GLOBAL_CHANNEL, message);
}


export const initializeRedisPubSub = (io: Server) => {
  subscriber.subscribe(GLOBAL_CHANNEL, (err) => {
    if (err) {
      logger.error("Failed to subscribe to Redis channel", { error: err });
      if(!isLocal())Sentry.captureException(err);
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

  logger.info("Redis pub/sub initialized");
};