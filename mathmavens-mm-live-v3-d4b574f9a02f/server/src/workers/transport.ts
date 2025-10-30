import { bullConnection, TransportJobData } from "../bullmq";
import { closeAndCleanTransport } from "../cleanup";
import { CONFIG, QUEUE_CONFIG } from "../config/config";
import logger from "../logger";
import { localRouters } from "../mediasoup";
import { Worker } from "bullmq";
import { Server } from "socket.io/dist";

interface Dependencies {
    io: Server;
}
export const createTransportWorker = ({io}:Dependencies) => {
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
        let transportTimeout: NodeJS.Timeout | null = null;
        
        // ✅ DON'T start timeout immediately for send transports
        // Only start when connection attempt begins (ICE starts)
        const startTimeoutIfNeeded = () => {
          if (transportTimeout || timeoutCleared) return;
          
          logger.debug("Starting transport connection timeout", {
            transportId: transport.id,
            timeoutMs: CONFIG.cleanup.transportTimeout,
          });
          
          transportTimeout = setTimeout(() => {
            if (!timeoutCleared && socket.data.transports.has(transport.id)) {
              logger.warn("Transport connection timeout", {
                transportId: transport.id,
                socketId: socket.id,
              });
              closeAndCleanTransport(socket, transport);
              socket.emit("transport-timeout", { transportId: transport.id });
            }
          }, CONFIG.cleanup.transportTimeout);
        };

        const clearTimeoutOnce = () => {
          if (!timeoutCleared) {
            if (transportTimeout) {
              clearTimeout(transportTimeout);
            }
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
          if (iceState === "checking" || iceState === "new") {
            startTimeoutIfNeeded();
          }


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
if (dtlsState === "connecting") {
            startTimeoutIfNeeded();
          }
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