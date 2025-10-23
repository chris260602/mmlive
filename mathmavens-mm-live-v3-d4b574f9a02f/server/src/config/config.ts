// src/config.ts
import { RouterRtpCodecCapability } from "mediasoup/node/lib/rtpParametersTypes";
import { WebRtcTransportOptions } from "mediasoup/node/lib/WebRtcTransportTypes";

export const MEDIACODECS_CONFIG: RouterRtpCodecCapability[] = [
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
      "x-google-start-bitrate": 2000,
      "x-google-min-bitrate": 1000,
      "x-google-max-bitrate": 2500,
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

export const WEBRTCTRANSPORT_OPTIONS: WebRtcTransportOptions = {
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
};

export const QUEUE_CONFIG = {
  roomJoin: {
    name: "room-join-queue",
    concurrency: 10, // Process 10 joins simultaneously
    limiter: {
      max: 50, // Max 50 jobs
      duration: 1000, // Per second
    },
  },
  transport: {
    name: "transport-creation-queue",
    concurrency: 20,
    limiter: {
      max: 100,
      duration: 1000,
    },
  },
};
export const CONFIG = {
  redis: {
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    keyTTL: {
      peer: 24 * 60 * 60, // 24 hours
      producer: 24 * 60 * 60, // 24 hours
      room: 24 * 60 * 60, // 24 hours
    },
  },
  cleanup: {
    // 15 * 60 * 1000
    orphanCheckInterval: 15 * 60 * 1000, // 15 minutes
    transportTimeout: 60000, // 60 seconds
    memoryCleanupInterval: 5 * 60 * 1000,
  },
  room: {
    maxPeersPerRoom: 100,
  },
  mediasoup: {
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  },
  server: {
    // Unique server ID for multi-server deployments
    id: process.env.SERVER_ID || `server-${process.pid}-${Date.now()}`,
  },
};

export const GLOBAL_CHANNEL = "room-events";
