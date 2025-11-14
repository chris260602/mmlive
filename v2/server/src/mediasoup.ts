import { types as mediasoupTypes } from "mediasoup";
import logger from "./logger";
import { CONFIG } from "./config/config";
// import mediasoup from "mediasoup";
import os from "os";
import { RouterRtpCodecCapability } from "mediasoup/node/lib/rtpParametersTypes";
import { Router } from "mediasoup/node/lib/RouterTypes";
import { redis } from "./redis";
import { isLocal } from "./utils/envUtils";
const mediasoup = require("mediasoup");

export let workers: mediasoupTypes.Worker[] = [];
let nextWorkerIndex = 0;
export const localRouters = new Map<string, Router>();
export const getMediasoupWorker = () => {
  const worker = workers[nextWorkerIndex];
  if (++nextWorkerIndex === workers.length) nextWorkerIndex = 0;
  return worker;
};

// --- Worker Creation ---
export const createWorkers = async () => {
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
        if(!isLocal())Sentry.captureException(error, { tags: { workerPid: worker.pid } });
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


export const getOrCreateRoom = async (roomName: string) => {
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