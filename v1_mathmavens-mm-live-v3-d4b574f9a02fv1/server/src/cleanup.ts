import { bullConnection, roomJoinQueue, transportQueue } from "./bullmq";
import { QUEUE_CONFIG } from "./config/config";
import logger from "./logger";
import { localRouters } from "./mediasoup";
import { getPeer } from "./peerManager";
import { publishToRoom, redis, scanRedisKeys } from "./redis";
import { types as mediasoupTypes } from "mediasoup";
import { Server } from "socket.io";
import { isLocal } from "./utils/envUtils";

export const cleanupPeer = async (socket: any) => {
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
    if(!isLocal())Sentry.captureException(error, {
      tags: { socketId, function: "cleanupPeer" },
    });
  }
};

export const closeAndCleanTransport = async (
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
    if(!isLocal())Sentry.captureException(error);
  }
};

// --- ORPHANED RESOURCE CLEANUP ---
export const cleanupOrphanedResources = async () => {
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
    if(!isLocal())Sentry.captureException(error);
  }
};

export const cleanupQueueMetadata = async () => {
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

export const cleanupStaleJobs = async () => {
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


export const cleanupDisconnectedPeerMaps = (io:Server) => {
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
