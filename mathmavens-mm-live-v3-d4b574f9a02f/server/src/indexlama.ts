console.log("Starting server...");
require("dotenv").config();
require("./instrument");

import { Request, Response } from "express";
import { types as mediasoupTypes } from "mediasoup";
import { RouterRtpCodecCapability } from "mediasoup/node/lib/rtpParametersTypes";
import expressWinston from "express-winston";
import logger from "./logger";
import { UAParser } from "ua-parser-js";

import os from "os";
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
    // Skip health check logs to reduce noise
    ignoreRoute: (req, res) => req.url === "/health",
  })
);

app.get("/", (req: Request, res: Response) => {
  res.send("MM LIVE server is running");
});

app.get("/debug-sentry", function mainHandler(req: Request, res: Response) {
  // Send a log before throwing the error
  Sentry.logger.info("User triggered test error", {
    action: "test_error_endpoint",
  });
  throw new Error("My first Sentry error!");
});

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    workers: workers.length,
    rooms: rooms.size,
    timestamp: new Date().toISOString(),
  });
});

Sentry.setupExpressErrorHandler(app);

let workers: mediasoupTypes.Worker[] = [];
let nextWorkerIndex = 0; // To keep track of the next worker to use (round-robin)
// Using a Map to store rooms instead of an object for better performance with frequent additions/deletions.
let rooms = new Map(); // rooms: Map<roomName, { router: Router, peers: Map, taskQueue: PQueue }>

let peerStates = new Map();

const getMediasoupWorker = () => {
  const worker = workers[nextWorkerIndex];

  if (++nextWorkerIndex === workers.length) {
    nextWorkerIndex = 0;
  }

  return worker;
};

const createWorkers = async () => {
  const numWorkers = Math.min(os.cpus().length, os.cpus().length-1); // Limit workers
  logger.info(`Creating ${numWorkers} Mediasoup workers`, {
    cpuCount: os.cpus().length,
    maxWorkers: os.cpus().length-1,
  });
  console.log(`Creating ${numWorkers} Mediasoup workers...`);

  for (let i = 0; i < numWorkers; i++) {
    try {
      const worker = await mediasoup.createWorker({
        logLevel: "warn",
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
      });

      worker.on("died", async (error: any) => {
        console.error(`Mediasoup worker ${worker.pid} has died:`, error);
        logger.error(`Mediasoup worker died`, {
          workerPid: worker.pid,
          error: error.message,
          stack: error.stack,
          remainingWorkers: workers.length - 1,
        });

        // Also send to Sentry
        Sentry.captureException(error, {
          tags: { workerPid: worker.pid },
        });
        // Remove dead worker from array
        const index = workers.indexOf(worker);
        if (index > -1) {
          workers.splice(index, 1);
          console.log(
            `Removed dead worker. Remaining workers: ${workers.length}`
          );
        }

        // Create replacement worker if we have less than minimum
        if (workers.length < 1) {
          console.log("Creating replacement worker...");
          Sentry.captureMessage("All workers died - creating replacement", {
            level: "critical",
          });
          await createReplacementWorker();
        }
      });

      workers.push(worker);
      logger.info(`Worker created`, {
        workerIndex: i + 1,
        pid: worker.pid,
      });
      console.log(`Worker ${i + 1} created with PID: ${worker.pid}`);
    } catch (error) {
      console.error(`Failed to create worker ${i}:`, error);
      logger.error(`Failed to create worker`, {
        workerIndex: i,
        error,
      });
    }
  }

  if (workers.length === 0) {
    Sentry.captureMessage("All workers died - creating replacement", {
      level: "critical",
    });
    logger.error(`All workers died`);
    throw new Error("Failed to create any MediaSoup workers");
  }
};

const createReplacementWorker = async () => {
  try {
    const worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    });

    worker.on("died", async (error: any) => {
      console.error(`Replacement worker ${worker.pid} has died:`, error);
      const index = workers.indexOf(worker);
      if (index > -1) {
        workers.splice(index, 1);
      }
      if (workers.length < 1) {
        await createReplacementWorker();
      }
    });

    workers.push(worker);
    console.log(`Replacement worker created with PID: ${worker.pid}`);
  } catch (error) {
    console.error("Failed to create replacement worker:", error);
  }
};

// We run this once at startup.
createWorkers();

// --- Peer and Resource Management ---

const addPeer = (socket, room, userData) => {
  room.peers.set(socket.id, {
    socket,
    userData,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  });
};

const getPeer = (socketId: string) => {
  for (const room of rooms.values()) {
    if (room.peers.has(socketId)) {
      return room.peers.get(socketId);
    }
  }
};

const getRoomFromSocketId = (socketId: string) => {
  for (const [name, room] of rooms.entries()) {
    if (room.peers.has(socketId)) {
      return { name, room };
    }
  }
  return { name: null, room: null };
};

const findPeerByProducerId = (producerId: string) => {
  for (const room of rooms.values()) {
    for (const peer of room.peers.values()) {
      if (peer.producers.has(producerId)) {
        return peer;
      }
    }
  }
  return null;
};

const getOrCreateRoom = async (roomName: string) => {
  let room = rooms.get(roomName);
  if (!room) {
    const worker = getMediasoupWorker();
    if (!worker) {
      throw new Error("No available MediaSoup workers");
      // PUT SENTRY
    }
    console.log(`Creating room: ${roomName}`);
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
    const router = await worker.createRouter({ mediaCodecs });
    room = { router, peers: new Map(), createdAt: new Date() };
    rooms.set(roomName, room);
  }
  return room;
};

const cleanupPeer = (socket, preserveState = false) => {
  const { room, name: roomName } = getRoomFromSocketId(socket.id);
  const peer = getPeer(socket.id);

  if (!peer || !room) {
    return;
  }

  console.log(`Cleaning up peer ${socket.id} from room ${roomName}`);

  logger.info("Cleaning up peer", {
    socketId: socket.id,
    roomName,
    preserveState,
    transportCount: peer.transports.size,
    producerCount: peer.producers.size,
    consumerCount: peer.consumers.size,
  });

  // Preserve state for potential reconnection
  if (preserveState && peer.userData?.peerId) {
    peerStates.set(peer.userData.peerId, {
      userData: peer.userData,
      roomName: roomName,
      producerCount: peer.producers.size,
      consumerCount: peer.consumers.size,
      lastSeen: new Date(),
    });

    // Clean up old states (older than 5 minutes)
    setTimeout(() => {
      peerStates.delete(peer.userData.peerId);
    }, 5 * 60 * 1000);
  }

  // Close all transports
  for (const transport of peer.transports.values()) {
    try {
      transport.close();
    } catch (error) {
      console.error("Error closing transport:", error);
    }
  }

  room.peers.delete(socket.id);
  socket.to(roomName).emit("peer-left", { peerId: peer.userData?.peerId });

  if (room.peers.size === 0) {
    console.log(
      `Room ${roomName} is now empty. Closing router and deleting room.`
    );
    room.router.close(); // Important: Releases Mediasoup resources
    rooms.delete(roomName);

    logger.info("Room empty, closing", {
      roomName,
      roomAge: Date.now() - room.createdAt.getTime(),
    });
  }
  console.log(`Peer ${socket.id} cleaned up successfully`);
};

// Heartbeat system
const startHeartbeat = () => {
  setInterval(() => {
    for (const room of rooms.values()) {
      for (const peer of room.peers.values()) {
        peer.socket.emit("heartbeat", { timestamp: Date.now() });
      }
    }
  }, 30000); // Every 30 seconds
};

const cleanupInactiveRooms = () => {
  setInterval(() => {
    const now = new Date();
    for (const [roomName, room] of rooms.entries()) {
      if (room.peers.size === 0) {
        const timeSinceCreation = now.getTime() - room.createdAt.getTime();
        if (timeSinceCreation > 60 * 60 * 1000) {
          // 60 minutes
          console.log(`Cleaning up empty room: ${roomName}`);
          rooms.delete(roomName);
        }
      }
    }
  }, 60000); // Check every minute
};

startHeartbeat();
cleanupInactiveRooms();

// --- Socket.IO Connection Handling ---

io.on("connection", (socket) => {
  // BROWSER DETECTION: Parse the User-Agent string
  const userAgentString = socket.handshake.headers["user-agent"];
  const parser = new UAParser(userAgentString);
  const result = parser.getResult();

  // Store the parsed info on the socket object for later use
  socket.clientInfo = {
    browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim(),
    os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
    device: result.device.vendor ? `${result.device.vendor} ${result.device.model}` : 'Desktop',
  };

  // Keep the initial connection log
  logger.info("Client connected", {
    socketId: socket.id,
    ip: socket.handshake.address,
    ...socket.clientInfo, // We can spread the new object here
  });

  socket.on("heartbeat-response", (data) => {
    const peer = getPeer(socket.id);
    if (peer) {
      peer.lastActivity = new Date();
    }
  });

  socket.on("leaveRoom", () => {
    cleanupPeer(socket, false);
  });

  socket.on("disconnect", (reason: string) => {
    console.log(`Client disconnected: ${socket.id}`);
    logger.info("Client disconnected", {
      socketId: socket.id,
      reason,
    });

    const preserveState =
      reason === "transport close" || reason === "transport error";
    cleanupPeer(socket, preserveState);
  });

  socket.on(
    "refresh-student-server",
    async ({ peerId, userId }: { peerId: string; userId: string }) => {
      console.log("refreshing", peerId);
      if (peerId)
        socket.to(peerId).emit("refresh-student-client", { peerId, userId });
    }
  );
  socket.on(
    "kick-student-server",
    async ({ peerId, userId }: { peerId: string; userId: string }) => {
      console.log("kicking", peerId);
      if (peerId)
        socket.to(peerId).emit("kick-student-client", { peerId, userId });
    }
  );

  // Client wants to join a room
  socket.on(
    "joinRoom",
    async (
      {
        roomName,
        userData,
        peerId,
      }: { roomName: string; userData: object; peerId: string },
      callback: Function
    ) => {
      logger.info("User joining room", {
        roomName,
        peerId,
        userId: userData?.id,
        socketId: socket.id,
        ...socket.clientInfo 
      });
      try {
        const updatedUserData = { ...userData, peerId };
        const room = await getOrCreateRoom(roomName);

        socket.join(peerId);
        socket.join(roomName);

        // Check for existing state
        const previousState = peerStates.get(peerId);
        if (previousState) {
          console.log(`Reconnecting peer ${peerId} to room ${roomName}`);
          peerStates.delete(peerId); // Clean up the stored state
        }

        addPeer(socket, room, updatedUserData);

        // Inform the new peer about existing producers in the room
        const producersData = [];
        for (const peer of room.peers.values()) {
          if (peer.socket.id !== socket.id) {
            for (const producer of peer.producers.values()) {
              producersData.push({
                producerId: producer.id,
                userData: peer.userData,
              });
            }
          }
        }

        logger.info("User joined room successfully", {
          roomName,
          peerId,
          peerCount: room.peers.size + 1,
          existingProducers: producersData.length,
        });

        callback({
          rtpCapabilities: room.router.rtpCapabilities,
          producersData,
          isReconnection: !!previousState,
        });
      } catch (e: any) {
        console.error("Error joining room:", e);
        logger.error("Failed to join room", {
          roomName,
          peerId,
          error: e.message,
          stack: e.stack,
        });
        callback({ error: e.message });
      }
    }
  );

  // Client wants to create a transport
  socket.on(
    "createWebRtcTransport",
    async ({ isSender }: { isSender: boolean }, callback: Function) => {
      const startTime = Date.now();

      try {
        const { room } = getRoomFromSocketId(socket.id);
        if (!room) {
          logger.warn("Transport creation failed: not in room", {
            socketId: socket.id,
            isSender,
            component: "webrtc",
          });
          throw new Error("Not in a room");
        }

        const webRtcTransportOptions = {
          listenIps: [
            {
              ip: "0.0.0.0",
              announcedIp: process.env.MMLIVE_IP || undefined,
            },
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          initialAvailableOutgoingBitrate: 1000000,
          minimumAvailableOutgoingBitrate: 600000,
          maxSctpMessageSize: 262144,
          maxIncomingBitrate: 1500000,
          iceServers: [
            // Google STUN servers (free and highly reliable)
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },

            // Cloudflare STUN servers (also free)
            { urls: "stun:stun.cloudflare.com:3478" },

            // Mozilla STUN servers
            { urls: "stun:stun.services.mozilla.com:3478" },

            // Add your custom STUN server if you have one
            ...(process.env.STUN_SERVER
              ? [{ urls: process.env.STUN_SERVER }]
              : []),

            // TURN servers for NAT traversal (essential for production)
            ...(process.env.TURN_SERVER &&
            process.env.TURN_USERNAME &&
            process.env.TURN_CREDENTIALS
              ? [
                  {
                    urls: process.env.TURN_SERVER,
                    username: process.env.TURN_USERNAME,
                    credential: process.env.TURN_CREDENTIALS,
                    credentialType: "password",
                  },
                ]
              : []),
          ],
          iceTransportPolicy: "all",
          bundlePolicy: "max-bundle",
          rtcpMuxPolicy: "require",
        };

        logger.debug("Creating WebRTC transport", {
          socketId: socket.id,
          isSender,
          roomPeers: room.peers.size,
          component: "webrtc",
        });

        const transport = await room.router.createWebRtcTransport(
          webRtcTransportOptions
        );

        const duration = Date.now() - startTime;
        logger.info("WebRTC transport created", {
          transportId: transport.id,
          socketId: socket.id,
          isSender,
          duration,
          component: "webrtc",
        });

        transport.on("dtlsstatechange", (dtlsState: string) => {
          logger.debug("DTLS state change", {
            transportId: transport.id,
            state: dtlsState,
            socketId: socket.id,
            component: "webrtc",
          });
          if (dtlsState === "closed") {
            console.log("Transport closed");
            Sentry.captureMessage("ICE connection failed", {
              level: "error",
              tags: {
                transportId: transport.id,
                socketId: socket.id,
              },
            });
            socket.emit("transport-closed", {
              transportId: transport.id,
              reason: "dtls-closed",
            });
            transport.close();
          }
          if (dtlsState === "failed") {
            console.error(`Transport ${transport.id} DTLS failed`);
            logger.error("DTLS connection failed", {
              transportId: transport.id,
              socketId: socket.id,
              component: "webrtc",
            });
            Sentry.captureMessage("DTLS connection failed", {
              level: "error",
              tags: {
                transportId: transport.id,
                socketId: socket.id,
              },
            });
            // Emit to client for recovery
            socket.emit("transport-dtls-failed", { transportId: transport.id });
          }
        });

        transport.on("icestatechange", (iceState: string) => {
          console.log(`Transport ${transport.id} ICE state: ${iceState}`);
          logger.debug("ICE state change", {
            transportId: transport.id,
            state: iceState,
            socketId: socket.id,
            component: "webrtc",
          });

          if (iceState === "disconnected") {
            console.warn(`Transport ${transport.id} ICE disconnected`);
            socket.emit("transport-ice-disconnected", {
              transportId: transport.id,
            });
          } else if (iceState === "failed") {
            console.error(`Transport ${transport.id} ICE failed`);
            logger.error("ICE connection failed", {
              transportId: transport.id,
              socketId: socket.id,
              component: "webrtc",
            });
            Sentry.captureMessage("ICE connection failed", {
              level: "error",
              tags: {
                transportId: transport.id,
                socketId: socket.id,
              },
            });
            socket.emit("transport-ice-failed", { transportId: transport.id });
          } else if (iceState === "connected") {
            console.log(`Transport ${transport.id} ICE connected successfully`);
            socket.emit("transport-ice-connected", {
              transportId: transport.id,
            });
          }
        });

        transport.on("routerclose", () => {
          console.log("Router closed, closing transport");
          transport.close();
        });

        const peer = room.peers.get(socket.id);
        peer.transports.set(transport.id, transport);

        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
      } catch (error: any) {
        console.error("Failed to create WebRTC transport:", error);
        logger.error("Failed to create WebRTC transport", {
          socketId: socket.id,
          isSender,
          error: error.message,
          stack: error.stack,
          duration: Date.now() - startTime,
          component: "webrtc",
        });
        callback({ error: error.message });
      }
    }
  );

  // Client wants to connect a transport
  socket.on(
    "connectTransport",
    async ({ transportId, dtlsParameters }, callback: Function) => {
      try {
        const peer = getPeer(socket.id);
        if (!peer) return callback({ error: "Peer not found" });

        const transport = peer.transports.get(transportId);
        if (!transport)
          return callback({
            error: `Transport with id "${transportId}" not found`,
          });

        await transport.connect({ dtlsParameters });
        console.log(`Transport connected: ${transportId}`);
        callback({});
      } catch (error: any) {
        console.error("Error connecting transport:", error);
        callback({ error: error.message });
      }
    }
  );

  // Client wants to produce media
  // In your "produce" handler
  socket.on(
    "produce",
    async ({ kind, rtpParameters, transportId, roomName }, callback) => {
      try {
        const peer = getPeer(socket.id);
        if (!peer) return callback({ error: "Peer not found" });

        const transport = peer.transports.get(transportId);
        if (!transport)
          return callback({
            error: `Transport with id "${transportId}" not found`,
          });

        const producer = await transport.produce({ kind, rtpParameters });

        producer.on("transportclose", () => {
          console.log(`Producer transport closed: ${producer.id}`);

          // Notify all consumers that this producer is gone
          socket.to(roomName).emit("producer-closed", {
            producerId: producer.id,
            peerId: peer.userData?.peerId,
          });

          peer.producers.delete(producer.id);
        });

        peer.producers.set(producer.id, producer);

        // Inform all other clients in the room that a new producer is available
        socket.to(roomName).emit("new-producer", {
          producerId: producer.id,
          userData: peer.userData,
          kind,
        });

        console.log(`Producer created: ${producer.id} (${kind})`);
        callback({ id: producer.id });
      } catch (e: any) {
        console.error("Error producing:", e);
        callback({ error: e.message });
      }
    }
  );

  // Client wants to consume media
  socket.on(
    "consume",
    async (
      {
        transportId,
        producerId,
        rtpCapabilities,
      }: {
        transportId: string;
        producerId: string;
        rtpCapabilities: mediasoupTypes.RtpCapabilities;
      },
      callback: Function
    ) => {
      try {
        const peer = getPeer(socket.id);
        if (!peer) return callback({ error: "Peer not found" });

        const { room } = getRoomFromSocketId(socket.id);
        if (!room) return callback({ error: "Not in a room" });

        const transport = peer.transports.get(transportId);
        if (!transport)
          return callback({
            error: `Transport with id "${transportId}" not found`,
          });

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          return callback({ error: "Cannot consume this producer" });
        }

        const producingPeer = findPeerByProducerId(producerId); // ADDED: Find the owner
        if (!producingPeer) {
          return callback({ error: "Producing peer not found" });
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
        });
        // Set the users that are getting/consuming the media/video
        peer.consumers.set(consumer.id, consumer);

        consumer.on("transportclose", () => {
          console.log(`Consumer transport closed: ${consumer.id}`);
          peer.consumers.delete(consumer.id);
        });

        consumer.on("producerclose", () => {
          console.log(`Consumer's producer closed: ${consumer.id}`);
          socket.emit("consumer-closed", { consumerId: consumer.id });
          consumer.close();
          peer.consumers.delete(consumer.id);
        });
        console.log(`Consumer created: ${consumer.id}`);

        callback({
          params: {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            userData: producingPeer.userData,
            // Add additional info here
          },
        });
      } catch (error: any) {
        console.error("Error creating consumer:", error);
        callback({ error: error.message });
      }
    }
  );

  // Client is ready to receive media for a consumer
  socket.on("resume", async ({ consumerId }: { consumerId: string }) => {
    const peer = getPeer(socket.id);
    if (!peer) {
      console.error(`Peer not found for socket ID: ${socket.id} during resume`);
      return;
    }

    const consumer = peer.consumers.get(consumerId);
    if (consumer) {
      try {
        await consumer.resume();
        console.log(`Resumed consumer ${consumer.id}`);
      } catch (error) {
        console.error(`Error resuming consumer ${consumer.id}:`, error);
      }
    } else {
      console.warn(`Consumer not found for ID: ${consumerId} during resume`);
    }
  });

  socket.on("connection-quality", (data: string) => {
    const peer = getPeer(socket.id);
    if (peer) {
      peer.connectionQuality = data;
      peer.lastActivity = new Date();
    }
  });

  // Handle explicit producer closure notification
  socket.on("producer-closing", ({ producerId, roomName }) => {
    console.log(`Client notifying producer ${producerId} is closing`);
    const peer = getPeer(socket.id);

    if (peer) {
      // Remove from peer's producers
      peer.producers.delete(producerId);

      // Notify all other peers in the room
      socket.to(roomName).emit("producer-closed", {
        producerId,
        peerId: peer.userData?.peerId,
      });
    }
  });
});

process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  logger.warn("Received SIGINT, shutting down gracefully");

  for (const worker of workers) {
    logger.info("Closing worker", { pid: worker.pid });

    await worker.close();
  }

  server.close(() => {
    console.log("Server closed");
    logger.info("Server closed");

    process.exit(0);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});
