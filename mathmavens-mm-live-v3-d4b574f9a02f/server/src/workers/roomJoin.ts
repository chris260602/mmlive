import { bullConnection, RoomJoinJobData } from "../bullmq";
import { CONFIG, QUEUE_CONFIG } from "../config/config";
import logger from "../logger";
import { publishToRoom, redis, scanRedisKeys } from "../redis";
import { Worker } from "bullmq";
import { Server } from "socket.io";
import { getOrCreateRoom } from "../mediasoup";
import { getPeer } from "../peerManager";
import { cleanupPeer } from "../cleanup";

interface Dependencies {
    io: Server;
}

export const createRoomJoinWorker = ({ io }: Dependencies) => {
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