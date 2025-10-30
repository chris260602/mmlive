import { Server } from "socket.io/dist";
import { roomJoinQueueEvents, transportQueue } from "../bullmq";
import { transportQueueEvents } from "../bullmq";
import { roomJoinQueue } from "../bullmq";
import { CONFIG } from "../config/config";
import logger from "../logger";
import { publishToRoom, redis, scanRedisKeys } from "../redis";
import { UAParser } from "ua-parser-js";
import { cleanupPeer } from "../cleanup";
import { getPeer, getProducerInfo } from "../peerManager";
import { getRoomFromSocketId } from "../peerManager";
import { isLocal } from "../utils/envUtils";

export const initializeSocketIO = (io: Server) => {
  const producerLocks = new Map<string, Promise<any>>();

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
          if (!isLocal())
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
                callback({
                  error: result.error || "Failed to create transport",
                });
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
          if (!isLocal())
            Sentry.captureException(e, {
              tags: { socketId: socket.id, action: "createWebRtcTransport" },
            });
          callback({ error: e.message });
        }
      }
    );

    socket.on(
      "connectTransport",
      async ({ transportId, dtlsParameters }, callback: Function) => {
        try {
          logger.info("connectTransport called", {
        transportId,
        socketId: socket.id,
        hasTransportsMap: !!socket.data.transports,
        transportMapType: typeof socket.data.transports,
        availableTransports: socket.data.transports 
          ? Array.from(socket.data.transports.keys())
          : "transports map is undefined",
        totalTransports: socket.data.transports?.size || 0,
      });
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
      async (
        { kind, rtpParameters, transportId, roomName, appData },
        callback: Function
      ) => {
        const cameraType = appData?.cameraType || appData?.mediaType;
        const lockKey = `${socket.id}:${cameraType}`;

        // ✅ Prevent concurrent producer creation for same camera
        if (producerLocks.has(lockKey)) {
          logger.warn("Producer creation already in progress", {
            socketId: socket.id,
            cameraType,
          });
          return callback({ error: "Producer creation already in progress" });
        }

        const producerPromise = (async () => {
          try {
            const transport = socket.data.transports.get(transportId);
            if (!transport) {
              throw new Error("Transport not found");
            }

            const existingProducers = Array.from(
              socket.data.producers.entries()
            );
            let duplicateProducer;
            if (kind === "audio") {
              // Find existing audio producer
              duplicateProducer = existingProducers.find(
                ([id, p]: [string, any]) => {
                  const pAppData = p.appData || {};
                  return pAppData.mediaType === "audio" || p.kind === "audio";
                }
              );
            } else {
              // Find existing video producer with same camera type
              const cameraType = appData?.cameraType || "primary";
              duplicateProducer = existingProducers.find(
                ([id, p]: [string, any]) => {
                  return (
                    p.appData?.cameraType === cameraType && p.kind === "video"
                  );
                }
              );
            }

            if (duplicateProducer) {
              const [existingId, existingProducer] = duplicateProducer;

              logger.warn("Duplicate producer detected, replacing", {
                socketId: socket.id,
                kind,
                // mediaType,
                oldProducerId: existingId,
                newRequest: true,
              });

              // Close old producer first
              try {
                existingProducer.close();
                socket.data.producers.delete(existingId);
                await redis.del(`producer:${existingId}:peer`);
                await redis.del(`producer:${existingId}:info`);

                const peer = await getPeer(socket.id);
                await publishToRoom(
                  roomName,
                  "producer-closed",
                  { producerId: existingId, peerId: peer?.peerId },
                  socket.id
                );
              } catch (closeError) {
                logger.error("Error closing duplicate producer", {
                  error: closeError,
                  producerId: existingId,
                });
              }
            }

            const producer = await transport.produce({
              kind,
              rtpParameters,
              appData: {
                ...appData,
                kind, // Ensure kind is in appData
                socketId: socket.id,
              },
            });

            logger.info("✅ Producer created", {
              producerId: producer.id,
              kind,
              socketId: socket.id,
              // mediaType,
            });

            socket.data.producers.set(producer.id, producer);

            // ✅ Store complete producer info in Redis
            const producerInfo = {
              peerSocketId: socket.id,
              appData: JSON.stringify(appData || {}),
              kind: kind,
              createdAt: Date.now().toString(),
            };

            await redis.hset(`producer:${producer.id}:info`, producerInfo);
            await redis.expire(
              `producer:${producer.id}:info`,
              CONFIG.redis.keyTTL.producer
            );

            await redis.set(
              `producer:${producer.id}:peer`,
              socket.id,
              "EX",
              CONFIG.redis.keyTTL.producer
            );

            // Set up producer event listeners
            producer.on("transportclose", () => {
              logger.info("Producer transport closed", {
                producerId: producer.id,
                kind,
                socketId: socket.id,
              });
              socket.data.producers.delete(producer.id);
              redis.del(`producer:${producer.id}:peer`).catch(console.error);
              redis.del(`producer:${producer.id}:info`).catch(console.error);
            });

            // ✅ Notify room about new producer
            const peer = await getPeer(socket.id);
            await publishToRoom(
              roomName,
              "new-producer",
              {
                producerId: producer.id,
                userData: peer,
                kind,
                appData: {
                  ...appData,
                  kind,
                },
              },
              socket.id
            );

            logger.info("Producer broadcast complete", {
              producerId: producer.id,
              kind,
              roomName,
            });

            return { id: producer.id };
          } catch (e: any) {
            logger.error("Failed to create producer", {
              kind,
              transportId,
              socketId: socket.id,
              appData,
              error: e.message,
              stack: e.stack,
            });
            if (!isLocal())
              Sentry.captureException(e, {
                tags: { socketId: socket.id, action: "produce" },
              });
            throw e;
          }
        })();

        producerLocks.set(lockKey, producerPromise);

        try {
          const result = await producerPromise;
          callback(result);
        } catch (error: any) {
          callback({ error: error.message });
        } finally {
          producerLocks.delete(lockKey);
        }
      }
    );

    socket.on(
      "consume",
      async (
        { transportId, producerId, rtpCapabilities },
        callback: Function
      ) => {
        try {
          const { router } = await getRoomFromSocketId(socket.id);
          const transport = socket.data.transports.get(transportId);
          if (!router) {
            logger.error("Router not found", {
              socketId: socket.id,
              producerId,
            });
            return callback({ error: "Router not found" });
          }

          if (!transport) {
            logger.error("Transport not found", {
              socketId: socket.id,
              transportId,
              producerId,
              availableTransports: Array.from(socket.data.transports.keys()),
            });
            return callback({ error: "Transport not found" });
          }

          if ((transport as any)._closed) {
            logger.error("Transport is closed", {
              socketId: socket.id,
              transportId,
            });
            return callback({ error: "Transport is closed" });
          }

          // ✅ Check if can consume
          const canConsume = router.canConsume({ producerId, rtpCapabilities });

          if (!canConsume) {
            logger.warn("Cannot consume producer", {
              producerId,
              socketId: socket.id,
            });
            return callback({ error: "Cannot consume this producer" });
          }

          // ✅ Get producer info
          const producerInfo = await getProducerInfo(producerId);
          if (!producerInfo) {
            logger.error("Producer info not found", {
              producerId,
              socketId: socket.id,
            });
            return callback({ error: "Producer not found" });
          }

          const producerKind = producerInfo.kind || "video";

          // ✅ CRITICAL: Check if already consuming this producer
          const existingConsumer = Array.from(
            socket.data.consumers.entries()
          ).find(([id, consumer]: [string, any]) => {
            return consumer.producerId === producerId;
          });

          if (existingConsumer) {
            const [existingId, consumer] = existingConsumer;
            logger.warn("Already consuming this producer", {
              socketId: socket.id,
              producerId,
              existingConsumerId: existingId,
            });

            // Return existing consumer instead of creating duplicate
            return callback({
              params: {
                id: consumer.id,
                producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                userData: await getProducerInfo(producerId).then(
                  (info) => info?.peerUserData
                ),
                appData: consumer.appData,
              },
            });
          }

          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: producerKind === "video", // Start video paused, audio playing
            appData: {
              ...(producerInfo.appData || {}),
              consumerSocketId: socket.id,
              producerKind: producerKind,
              createdAt: Date.now(),
            },
          });

          socket.data.consumers.set(consumer.id, consumer);

          consumer.on("producerclose", () => {
            socket.data.consumers.delete(consumer.id);
            socket.emit("consumer-closed", { consumerId: consumer.id });
          });

          consumer.on("producerpause", () => {
            socket.emit("consumer-producer-paused", {
              consumerId: consumer.id,
            });
          });

          consumer.on("producerresume", () => {
            socket.emit("consumer-producer-resumed", {
              consumerId: consumer.id,
            });
          });

          consumer.on("transportclose", () => {
            socket.data.consumers.delete(consumer.id);
          });

          logger.info("Consumer created successfully", {
            consumerId: consumer.id,
            producerId,
            socketId: socket.id,
          });

          callback({
            params: {
              id: consumer.id,
              producerId,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters,
              userData: producerInfo.peerUserData,
              appData: {
                ...producerInfo.appData,
                kind: producerKind,
              },
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
          if (!isLocal())
            Sentry.captureException(error, {
              tags: { socketId: socket.id, action: "consume" },
            });
          callback({ error: error.message });
        }
      }
    );

    socket.on(
      "resume",
      async ({ consumerId }: { consumerId: string }, callback: Function) => {
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
      }
    );

    socket.on(
      "pauseProducer",
      async ({ producerId }: { producerId: string }, callback: Function) => {
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
      }
    );

    // --- RESUME PRODUCER HANDLER ---
    socket.on(
      "resumeProducer",
      async ({ producerId }: { producerId: string }, callback: Function) => {
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
      }
    );

    // --- CLOSE PRODUCER HANDLER ---
    socket.on(
      "closeProducer",
      async ({ producerId }: { producerId: string }, callback: Function) => {
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
          await redis.del(`producer:${producerId}:info`);
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
      }
    );

    socket.on(
      "pauseConsumer",
      async ({ consumerId }: { consumerId: string }, callback: Function) => {
        try {
          const consumer = socket.data.consumers.get(consumerId);
          if (!consumer) {
            if (callback) callback({ error: "Consumer not found" });
            return;
          }

          await consumer.pause();
          logger.info("Consumer paused", { consumerId, socketId: socket.id });
          if (callback) callback({});
        } catch (error: any) {
          logger.error("Error pausing consumer", {
            consumerId,
            error: error.message,
          });
          if (callback) callback({ error: error.message });
        }
      }
    );

    socket.on(
      "resumeConsumer",
      async ({ consumerId }: { consumerId: string }, callback: Function) => {
        try {
          const consumer = socket.data.consumers.get(consumerId);
          if (!consumer) {
            if (callback) callback({ error: "Consumer not found" });
            return;
          }

          await consumer.resume();
          logger.info("Consumer resumed", { consumerId, socketId: socket.id });
          if (callback) callback({});
        } catch (error: any) {
          logger.error("Error resuming consumer", {
            consumerId,
            error: error.message,
          });
          if (callback) callback({ error: error.message });
        }
      }
    );

    // --- GET PRODUCER STATS HANDLER ---
    socket.on(
      "getProducerStats",
      async ({ producerId }: { producerId: string }, callback: Function) => {
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
      }
    );

    // --- GET CONSUMER STATS HANDLER ---
    socket.on(
      "getConsumerStats",
      async ({ consumerId }: { consumerId: string }, callback: Function) => {
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
      }
    );
  });
};
