import { REMOTE_STREAM_TYPE } from "@/utils/deviceUtils";
import { AppData, Producer, Transport } from "mediasoup-client/types";
import { Socket } from "socket.io-client";
import { createStore, StoreApi } from "zustand/vanilla";
import * as mediasoupClient from "mediasoup-client";
import { toast } from "sonner";
import { ws } from "@/ws";
import { USER_DATA_TYPE } from "@/types/user";
import { JOIN_ROOM_RESPONSE_TYPE } from "@/types/stream";
import * as Sentry from "@sentry/nextjs";
import { useContext } from "react";
import { UserStoreContext } from "@/providers/user-store-provider";
import { UserStore } from "./user-store";
import { isLocal, isProd } from "@/utils/envUtils";
export type StreamState = {
  localVideo?: MediaStream;
  secondaryVideo?: MediaStream;
  isJoining: boolean;
  isConnected: boolean;
  isDeviceLoading: boolean;
  isRoomJoined: boolean;
  selectedDevice: string;
  selectedSecondaryDevice: string;
  socket: Socket | null; // To hold the WebSocket instance
  videoRef: HTMLVideoElement | null; // To hold a ref to a <video> element
  remoteStreams: REMOTE_STREAM_TYPE[];
  sendTransportRef: Transport<AppData> | null;
  recvTransportRef: Transport<AppData> | null;
  videoProducerRef: Producer<AppData> | null;
  secondaryProducerRef: Producer<AppData> | null;
  deviceRef?: mediasoupClient.types.Device;
  videoDevices: REMOTE_STREAM_TYPE[];
  isSecondaryStreaming: boolean;
  cameraViewMode: "primary" | "secondary" | "both";
  // Producer tracking for reconnection
  availableProducers: Map<string, { userData: USER_DATA_TYPE; kind: string }>;
  activeConsumers: Map<
    string,
    { producerId: string; consumerId: string; userData: USER_DATA_TYPE }
  >;
  pendingConsumers: Set<string>;

  // Audio
  localAudio?: MediaStream;
  audioProducerRef: Producer<AppData> | null;
  isMicMuted: boolean;
  audioDevices: MediaDeviceInfo[];
  selectedAudioDevice: string;
  remoteAudioStreams: Map<string, MediaStream>;

  // Reconnection state
  isReconnecting: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  lastRoomName: string;
  lastUserData: USER_DATA_TYPE | null;
  lastPeerId: string;
  lastLiveRole: string;
  connectionQuality: "excellent" | "good" | "poor" | "disconnected";
  heartbeatInterval: NodeJS.Timeout | null;

  // Detailed connection status
  socketStatus: "connected" | "disconnected";
  sendTransportStatus: string;
  recvTransportStatus: string;

  // Reconnection locks
  locks: Set<string>;
  lockTimers: Map<string, NodeJS.Timeout>; // Timers to auto-release stale locks
  lockTimeoutMs: number;
};

export type StreamActions = {
  setSocket: (socket: Socket | null) => void;
  setVideoRef: (ref: HTMLVideoElement | null) => void;
  setIsJoining: (status: boolean) => void;
  setIsConnected: (status: boolean) => void;
  setIsDeviceLoading: (status: boolean) => void;
  setIsRoomJoined: (status: boolean) => void;
  setLocalVideo: (stream: MediaStream) => void;
  setSecondaryVideo: (stream: MediaStream | undefined) => void;
  setRemoteStreams: (streams: REMOTE_STREAM_TYPE[]) => void;
  removeRemoteStream: (consumerId: string) => void;
  setDeviceRef: (device: mediasoupClient.types.Device) => void;
  setVideoProducerRef: (ref: Producer<AppData>) => void;
  setSecondaryProducerRef: (ref: Producer<AppData> | null) => void;
  setSendTransportRef: (ref: Transport<AppData>) => void;
  setRecvTransportRef: (ref: Transport<AppData>) => void;
  updateLocalVideo: (newStream: MediaStream) => void;
  addRemoteStream: (remoteStream: REMOTE_STREAM_TYPE) => void;
  setVideoDevices: (devices: REMOTE_STREAM_TYPE[]) => void;
  setSelectedDevice: (device: string) => void;
  setSelectedSecondaryDevice: (device: string) => void;
  setIsSecondaryStreaming: (status: boolean) => void;
  handleRefreshStudent: (peerId: string, userId: string) => void;
  handleKickStudent: (peerId: string, userId: string) => void;
  handleJoin: (
    roomName: string,
    userData: USER_DATA_TYPE,
    peerId: string,
    live_role: string
  ) => Promise<void>;
  handleCameraChange: () => Promise<void>;
  handleSecondaryCamera: (deviceId: string) => Promise<void>;
  stopSecondaryCamera: () => Promise<void>;
  consume: (producerId: string) => Promise<void>;
  handleLeaveRoom: () => void;
  setCameraViewMode: (mode: "primary" | "secondary" | "both") => void;

  // Audio actions
  setLocalAudio: (stream: MediaStream | undefined) => void;
  setAudioProducerRef: (ref: Producer<AppData> | null) => void;
  setIsMicMuted: (muted: boolean) => void;
  setAudioDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedAudioDevice: (deviceId: string) => void;
  handleAudioToggle: () => Promise<void>;
  handleAudioDeviceChange: () => Promise<void>;
  startAudioProduction: () => Promise<void>;
  stopAudioProduction: () => void;
  addRemoteAudioStream: (consumerId: string, stream: MediaStream) => void;
  removeRemoteAudioStream: (consumerId: string) => void;

  // New producer tracking actions
  addAvailableProducer: (
    producerId: string,
    userData: USER_DATA_TYPE,
    kind: string
  ) => void;
  removeAvailableProducer: (producerId: string) => void;
  addActiveConsumer: (
    producerId: string,
    consumerId: string,
    userData: USER_DATA_TYPE
  ) => void;
  removeActiveConsumer: (consumerId: string) => void;
  getProducerById: (
    producerId: string
  ) => { userData: USER_DATA_TYPE; kind: string } | null;
  reconsumeAllProducers: () => Promise<void>;
  isProducerBeingConsumed: (producerId: string) => boolean;
  cleanupAllStreams: () => void;
  // reconnection actions
  setIsReconnecting: (status: boolean) => void;
  setReconnectAttempts: (attempts: number) => void;
  setConnectionQuality: (
    quality: "excellent" | "good" | "poor" | "disconnected"
  ) => void;
  startHeartbeat: () => void;
  stopHeartbeat: () => void;
  handleDisconnection: () => void;
  attemptReconnection: () => Promise<void>;
  restoreConnection: () => Promise<void>;
  handleTransportFailure: (transportType: "send" | "receive") => Promise<void>;
  monitorConnectionHealth: () => void;
  setupSocketEventHandlers: () => void;
  getTransportStats: (
    transportType: "send" | "receive"
  ) => Promise<Map<string, RTCStatsReport> | null>;
  handleNuke: () => void;
  setLockWithTimeout: (lockName: string, timeoutMs?: number) => boolean;
  releaseLock: (lockName: string) => void;
  releaseAllLocks: () => void;
  isLocked: (lockName: string) => boolean;
  handleScreenChange: () => void;
  // Connection Status Actions
  updateConnectionStatus: () => void;
  pauseConsumersByType: (cameraType: "primary" | "secondary") => Promise<void>;
  resumeConsumersByType: (cameraType: "primary" | "secondary") => Promise<void>;
  manageConsumersForViewMode: (
    mode: "primary" | "secondary" | "both"
  ) => Promise<void>;
  _resetConnectionState: (isForRecovery: boolean) => void;
};

export type StreamStore = StreamState & StreamActions;

export const initStreamStore = (): StreamState => {
  return {
    isJoining: false,
    isConnected: true,
    isDeviceLoading: true,
    isRoomJoined: false,
    selectedDevice: "",
    selectedSecondaryDevice: "",
    socket: null,
    videoRef: null,
    remoteStreams: [],
    sendTransportRef: null,
    recvTransportRef: null,
    videoProducerRef: null,
    secondaryProducerRef: null,
    videoDevices: [],
    isSecondaryStreaming: false,
    cameraViewMode: "both",

    // Audio
    audioProducerRef: null,
    isMicMuted: true,
    audioDevices: [],
    selectedAudioDevice: "",
    remoteAudioStreams: new Map(),

    // Producer tracking
    availableProducers: new Map(),
    activeConsumers: new Map(),
    pendingConsumers: new Set(),

    //  Reconnection state
    isReconnecting: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    lastRoomName: "",
    lastUserData: null,
    lastPeerId: "",
    lastLiveRole: "",
    connectionQuality: "excellent",
    heartbeatInterval: null,
    socketStatus: "disconnected",
    sendTransportStatus: "new",
    recvTransportStatus: "new",

    // Reconnection locks
    locks: new Set(),
    lockTimers: new Map(),
    lockTimeoutMs: 15000,
  };
};

export const defaultInitState: StreamState = {
  isJoining: false,
  isConnected: true,
  isDeviceLoading: true,
  isRoomJoined: false,
  selectedDevice: "",
  selectedSecondaryDevice: "",
  socket: null,
  videoRef: null,
  remoteStreams: [],
  sendTransportRef: null,
  recvTransportRef: null,
  videoProducerRef: null,
  secondaryProducerRef: null,
  videoDevices: [],
  isSecondaryStreaming: false,
  cameraViewMode: "both",

  // Audio
  audioProducerRef: null,
  isMicMuted: true,
  audioDevices: [],
  selectedAudioDevice: "",
  remoteAudioStreams: new Map(),

  // Producer tracking
  availableProducers: new Map(),
  activeConsumers: new Map(),
  pendingConsumers: new Set(),

  //  Reconnection state
  isReconnecting: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  lastRoomName: "",
  lastUserData: null,
  lastPeerId: "",
  lastLiveRole: "",
  connectionQuality: "excellent",
  heartbeatInterval: null,
  socketStatus: "disconnected",
  sendTransportStatus: "new",
  recvTransportStatus: "new",

  // Reconnection locks
  locks: new Set(),
  lockTimers: new Map(),
  lockTimeoutMs: 15000,
};

export const createStreamStore = (
  initState: StreamState = defaultInitState,
  userStoreApi: StoreApi<UserStore>
) => {
  return createStore<StreamStore>()((set, get) => {
    const createSendTransport = (roomName: string): Promise<void> => {
      const { socket, deviceRef } = get();
      return new Promise((resolve, reject) => {
        if (!socket || !deviceRef) {
          reject(new Error("Socket or device not available"));
          return;
        }
        socket!.emit(
          "createWebRtcTransport",
          { isSender: true },
          (response) => {
            if (response.error) {
              console.error(
                "Server returned an error during transport:",
                response.error
              );
              if (!isLocal())
                Sentry.captureException(response.error, {
                  tags: {
                    operation: "createWebRtcTransport",
                    errorType: "connect_error",
                  },
                  level: "error",
                });
              if (response.error === "Not in a room") {
                toast.error(`Disconnected`);
                const {
                  lastRoomName,
                  lastUserData,
                  lastPeerId,
                  lastLiveRole,
                  handleJoin,
                  handleRefreshStudent,
                } = get();

                if (lastRoomName && lastUserData && lastPeerId) {
                  console.log(
                    "Attempting to rejoin room after transport error..."
                  );
                  try {
                    handleJoin(
                      lastRoomName,
                      lastUserData,
                      lastPeerId,
                      lastLiveRole
                    );
                  } catch (e) {
                    console.log(e);
                    if (lastPeerId && lastUserData.id)
                      handleRefreshStudent(lastPeerId, lastUserData?.id);
                  }
                }
                return reject(new Error(response.error));

                // else
                // window.location.reload();
              } else {
                toast.error(`Transport Failed`);
                if (!isLocal())
                  Sentry.captureException(response.error, {
                    tags: {
                      operation: "createWebRtcTransport",
                      errorType: "connect_error",
                    },
                    level: "error",
                  });
                return reject(new Error(response.error));
              }
            }

            try {
              const { params } = response;
              const transport = deviceRef!.createSendTransport(params);
              set({ sendTransportRef: transport });

              // Enhanced transport event handlers
              transport.on("connectionstatechange", (state) => {
                console.log("Send transport connection state:", state);

                if (state === "connected") {
                  get().setConnectionQuality("excellent");
                } else if (state === "connecting") {
                  get().setConnectionQuality("good");
                } else if (
                  state === "failed" ||
                  state === "disconnected" ||
                  state === "closed"
                ) {
                  console.log("Send transport failed, attempting recovery...");
                  get().setConnectionQuality("disconnected");
                  get().handleTransportFailure("send");
                }
              });

              transport.on(
                "connect",
                async ({ dtlsParameters }, callback, errback) => {
                  socket!.emit(
                    "connectTransport",
                    { transportId: transport.id, dtlsParameters },
                    (data) => {
                      if (data.error) errback(new Error(data.error));
                      else callback();
                    }
                  );
                }
              );

              transport.on(
                "produce",
                async ({ kind, rtpParameters, appData }, callback, errback) => {
                  try {
                    socket!.emit(
                      "produce",
                      {
                        transportId: transport.id,
                        kind,
                        rtpParameters,
                        roomName,
                        appData,
                      },
                      (data) => {
                        if (data.error) errback(new Error(data.error));
                        else callback({ id: data.id });
                      }
                    );
                  } catch (error) {
                    errback(error);
                  }
                }
              );

              resolve();
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    };

    const createRecvTransport = (): Promise<void> => {
      const { socket, deviceRef } = get();
      return new Promise((resolve, reject) => {
        if (!socket || !deviceRef) {
          reject(new Error("Socket or device not available"));
          return;
        }

        socket!.emit(
          "createWebRtcTransport",
          { isSender: false },
          (response) => {
            if (response.error) {
              console.error(
                "Server returned an error during transport:",
                response.error
              );
              toast.error(`Transport Failed`);
              return reject(new Error(response.error));
            }

            try {
              const { params } = response;
              const transport = deviceRef!.createRecvTransport(params);
              set({ recvTransportRef: transport });

              // Enhanced transport event handlers
              transport.on("connectionstatechange", (state) => {
                console.log("Receive transport connection state:", state);

                if (
                  state === "failed" ||
                  state === "disconnected" ||
                  state === "closed"
                ) {
                  console.log(
                    "Receive transport failed, attempting recovery..."
                  );
                  get().handleTransportFailure("receive");
                }
              });

              transport.on(
                "connect",
                ({ dtlsParameters }, callback, errback) => {
                  socket!.emit(
                    "connectTransport",
                    { transportId: transport.id, dtlsParameters },
                    (data) => {
                      if (data.error) errback(new Error(data.error));
                      else callback();
                    }
                  );
                }
              );

              resolve();
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    };
    return {
      ...initState,
      setSocket: (socketInstance) => set({ socket: socketInstance }),
      setVideoRef: (element) => set({ videoRef: element }),
      setIsJoining: (status) => set({ isJoining: status }),
      setIsConnected: (status) => set({ isConnected: status }),
      setIsDeviceLoading: (status) => set({ isDeviceLoading: status }),
      setIsRoomJoined: (status) => set({ isRoomJoined: status }),
      setLocalVideo: (stream) => set({ localVideo: stream }),
      setSecondaryVideo: (stream) => set({ secondaryVideo: stream }),
      setRemoteStreams: (streams) => set({ remoteStreams: streams }),
      setDeviceRef: (device) => set({ deviceRef: device }),
      setVideoProducerRef: (ref) => set({ videoProducerRef: ref }),
      setSecondaryProducerRef: (ref) => set({ secondaryProducerRef: ref }),
      setSendTransportRef: (ref) => set({ sendTransportRef: ref }),
      setRecvTransportRef: (ref) => set({ recvTransportRef: ref }),
      setVideoDevices: (devices) => set({ videoDevices: devices }),
      setSelectedDevice: (device) => set({ selectedDevice: device }),
      setSelectedSecondaryDevice: (device) =>
        set({ selectedSecondaryDevice: device }),
      setIsSecondaryStreaming: (status) =>
        set({ isSecondaryStreaming: status }),
      setCameraViewMode: (mode) => set({ cameraViewMode: mode }),
      _resetConnectionState: (isForRecovery: boolean) => {
        const {
          socket,
          sendTransportRef,
          recvTransportRef,
          localVideo,
          stopHeartbeat,
        } = get();
        console.log(
          `Resetting connection state. For recovery: ${isForRecovery}`
        );

        stopHeartbeat();

        // Only tell the server we're leaving on a clean, user-initiated exit.
        if (socket?.connected && !isForRecovery) {
          socket.emit("leaveRoom");
          if (get().secondaryProducerRef) get().stopSecondaryCamera();
        }

        // Safely close all transports and producers
        if (sendTransportRef) sendTransportRef.close();
        if (recvTransportRef) recvTransportRef.close();
        if (localVideo) localVideo.getTracks().forEach((track) => track.stop());

        const baseReset = {
          sendTransportRef: null,
          recvTransportRef: null,
          videoProducerRef: null,
          secondaryProducerRef: null,
          isSecondaryStreaming: false,
          isRoomJoined: false,
          localVideo: undefined,
          secondaryVideo: undefined,
          remoteStreams: [],
          availableProducers: new Map(),
          activeConsumers: new Map(),
          pendingConsumers: new Set(),
        };

        if (isForRecovery) {
          // Soft reset: Keep last join info for reconnection attempts
          set(baseReset);
        } else {
          // Hard reset: Clear everything, including reconnection data
          set({
            ...baseReset,
            lastRoomName: "",
            lastUserData: null,
            lastPeerId: "",
            lastLiveRole: "",
          });
        }
      },
      // Producer tracking actions
      addAvailableProducer: (
        producerId: string,
        userData: any,
        kind: string
      ) => {
        const { availableProducers } = get();

        // Don't add if it already exists
        if (availableProducers.has(producerId)) {
          console.log(`Producer ${producerId} already exists, skipping add`);
          return;
        }

        availableProducers.set(producerId, { userData, kind });
        set({ availableProducers: new Map(availableProducers) });
      },

      removeAvailableProducer: (producerId: string) => {
        const { availableProducers } = get();
        availableProducers.delete(producerId);
        set({ availableProducers: new Map(availableProducers) });
      },

      addActiveConsumer: (
        producerId: string,
        consumerId: string,
        userData: any
      ) => {
        const { activeConsumers } = get();
        activeConsumers.set(consumerId, { producerId, consumerId, userData });
        set({ activeConsumers: new Map(activeConsumers) });
      },

      removeActiveConsumer: (consumerId: string) => {
        const { activeConsumers } = get();
        const consumer = activeConsumers.get(consumerId);
        if (consumer) {
          console.log(
            `Removing active consumer: ${consumerId} for producer: ${consumer.producerId}`
          );
          activeConsumers.delete(consumerId);
          set({ activeConsumers: new Map(activeConsumers) });
        }
      },

      getProducerById: (producerId: string) => {
        const { availableProducers } = get();
        return availableProducers.get(producerId) || null;
      },
      isProducerBeingConsumed: (producerId: string) => {
        const { activeConsumers } = get();
        return Array.from(activeConsumers.values()).some(
          (consumer) => consumer.producerId === producerId
        );
      },
      cleanupAllStreams: () => {
        const { remoteStreams, setRemoteStreams } = get();
        console.log(`Cleaning up ${remoteStreams.length} streams`);

        // Stop all tracks
        remoteStreams.forEach((streamData) => {
          streamData.stream.getTracks().forEach((track) => {
            track.stop();
          });
        });

        // Clear everything
        setRemoteStreams([]);
        set({ activeConsumers: new Map() });
      },

      reconsumeAllProducers: async () => {
        const { availableProducers, consume, cleanupAllStreams } = get();
        console.log(`Re-consuming ${availableProducers.size} producers...`);
        cleanupAllStreams();

        const consumePromises = Array.from(availableProducers.keys()).map(
          async (producerId) => {
            try {
              console.log(`Re-consuming producer: ${producerId}`);
              await consume(producerId);
            } catch (error) {
              console.error(
                `Failed to re-consume producer ${producerId}:`,
                error
              );
            }
          }
        );

        await Promise.allSettled(consumePromises);
        console.log("Finished re-consuming all producers");
      },
      //
      handleRefreshStudent: async (peerId: string, userId: string) => {
        console.log(peerId, "peerid");
        ws.emit("refresh-student-server", { peerId, userId });
      },
      handleKickStudent: async (peerId: string, userId: string) => {
        console.log(peerId, "peerid");
        ws.emit("kick-student-server", { peerId, userId });
      },
      consume: async (producerId: string) => {
        const {
          socket,
          recvTransportRef,
          deviceRef,
          addRemoteStream,
          addActiveConsumer,
          pendingConsumers,
          addRemoteAudioStream,
        } = get();
        let shouldProceed = false;

        // Atomic check-and-set
        set((state) => {
          if (
            state.isProducerBeingConsumed(producerId) ||
            state.pendingConsumers.has(producerId)
          ) {
            console.warn(`Producer ${producerId} already being consumed`);
            return state; // No change
          }

          shouldProceed = true;
          const newPending = new Set(state.pendingConsumers);
          newPending.add(producerId);
          return { pendingConsumers: newPending };
        });

        if (!shouldProceed) return;

        if (!recvTransportRef || !deviceRef) {
          set((state) => {
            const newPending = new Set(state.pendingConsumers);
            newPending.delete(producerId);
            return { pendingConsumers: newPending };
          });
          return;
        }
        const { rtpCapabilities } = deviceRef;
        socket!.emit(
          "consume",
          { transportId: recvTransportRef.id, producerId, rtpCapabilities },
          async (response) => {
            if (!get().isRoomJoined) {
              console.warn(
                `Ignoring consume response for producer ${producerId} because user has left the room.`
              );
              set((state) => {
                const newPending = new Set(state.pendingConsumers);
                newPending.delete(producerId);
                return { pendingConsumers: newPending };
              });
              return;
            }
            if (response.error) {
              console.error(
                "Server returned an error during consume:",
                response.error
              );

              if (!isProd()) toast.error(`Failed to view stream`);
              if (!isLocal()) {
                Sentry.captureException(response.error, {
                  tags: {
                    operation: "consume",
                    producerId,
                  },
                  level: "error",
                });
              }
              set((state) => {
                const newPending = new Set(state.pendingConsumers);
                newPending.delete(producerId);
                return { pendingConsumers: newPending };
              });
              return;
            }

            try {
              const { params } = response;
              const consumer = await recvTransportRef.consume(params);
              const { track } = consumer;
              const newStream = new MediaStream([track]);

              console.log(params, "consumer");

              const cameraType = (params.appData?.cameraType || "primary") as
                | "primary"
                | "secondary";

              // Track the active consumer
              addActiveConsumer(producerId, consumer.id, params.userData);

              if (params.kind === "audio") {
                // Add to remote audio streams
                addRemoteAudioStream(consumer.id, newStream);
                console.log(`Added remote audio stream: ${consumer.id}`);
              } else {
                // Handle video as before
                addRemoteStream({
                  stream: newStream,
                  consumerId: consumer.id,
                  producerId: producerId,
                  userData: params.userData,
                  appData: { cameraType },
                } as REMOTE_STREAM_TYPE);
              }

              // Enhanced consumer event handling
              consumer.on("transportclose", () => {
                console.log(`Consumer transport closed: ${consumer.id}`);
                get().removeActiveConsumer(consumer.id);
                get().removeRemoteStream(consumer.id);
              });

              consumer.on("producerclose", () => {
                console.log(`Consumer's producer closed: ${consumer.id}`);
                get().removeActiveConsumer(consumer.id);
                get().removeRemoteStream(consumer.id);
                socket!.emit("consumer-closed", { consumerId: consumer.id });
              });

              socket!.emit("resume", { consumerId: consumer.id });
            } catch (error) {
              console.error("Error consuming media:", error);
            } finally {
              set((state) => {
                const newPending = new Set(state.pendingConsumers);
                newPending.delete(producerId);
                return { pendingConsumers: newPending };
              });
            }
          }
        );
      },
      updateLocalVideo: (newStream) => {
        // 1. Get the current (old) stream from the state
        const oldStream = get().localVideo;

        // 2. Stop all tracks on the previous stream to release the camera
        if (oldStream) {
          console.log("Stopping old video tracks.");
          oldStream.getTracks().forEach((track) => track.stop());
        }

        // 3. Set the new stream in the state
        set({ localVideo: newStream });
      },

      removeRemoteStream: (consumerId) => {
        const currentStreams = get().remoteStreams;
        set({
          remoteStreams: currentStreams.filter(
            (s) => s.consumerId !== consumerId
          ),
        });
      },
      addRemoteStream: (newStream) => {
        const existing = get().remoteStreams.find(
          (s) => s.producerId === newStream.producerId
        );

        if (existing) {
          console.error("DUPLICATE STREAM DETECTED:", {
            existingConsumerId: existing.consumerId,
            newConsumerId: newStream.consumerId,
            producerId: newStream.producerId,
            userData: newStream.userData,
          });
          // Don't add the duplicate
          return;
        }

        set({
          remoteStreams: [...get().remoteStreams, newStream],
        });
      },
      pauseConsumersByType: async (cameraType: "primary" | "secondary") => {
        const { socket, remoteStreams } = get();
        if (!socket) return;

        const streamsToManage = remoteStreams.filter(
          (stream) => (stream.appData?.cameraType || "primary") === cameraType
        );

        console.log(
          `Pausing ${streamsToManage.length} ${cameraType} consumers`
        );

        for (const stream of streamsToManage) {
          try {
            // Pause the video track locally (stops decoding)
            stream.stream.getVideoTracks().forEach((track) => {
              track.enabled = false;
            });

            socket.emit(
              "pauseConsumer",
              { consumerId: stream.consumerId },
              (response) => {
                if (response?.error) {
                  console.warn(
                    `Server pause failed for ${stream.consumerId}:`,
                    response.error
                  );
                }
              }
            );
          } catch (error) {
            console.error(
              `Failed to pause consumer ${stream.consumerId}:`,
              error
            );
          }
        }
      },

      resumeConsumersByType: async (cameraType: "primary" | "secondary") => {
        const { socket, remoteStreams } = get();
        if (!socket) return;

        const streamsToManage = remoteStreams.filter(
          (stream) => (stream.appData?.cameraType || "primary") === cameraType
        );

        console.log(
          `Resuming ${streamsToManage.length} ${cameraType} consumers`
        );

        for (const stream of streamsToManage) {
          try {
            // Resume the video track locally (starts decoding)
            stream.stream.getVideoTracks().forEach((track) => {
              track.enabled = true;
            });
            socket.emit("resumeConsumer", { consumerId: stream.consumerId });
          } catch (error) {
            console.error(
              `Failed to resume consumer ${stream.consumerId}:`,
              error
            );
          }
        }
      },

      manageConsumersForViewMode: async (
        mode: "primary" | "secondary" | "both"
      ) => {
        const { pauseConsumersByType, resumeConsumersByType } = get();

        if (mode === "primary") {
          // Show only primary, pause secondary
          await resumeConsumersByType("primary");
          await pauseConsumersByType("secondary");
        } else if (mode === "secondary") {
          // Show only secondary, pause primary
          await pauseConsumersByType("primary");
          await resumeConsumersByType("secondary");
        } else {
          // Show both, resume all
          await resumeConsumersByType("primary");
          await resumeConsumersByType("secondary");
        }

        console.log(`View mode changed to: ${mode}`);
      },
      handleJoin: async (
        roomName: string,
        userData: USER_DATA_TYPE,
        peerId: string,
        live_role: string
      ) => {
        const {
          socket,
          consume,
          handleCameraChange,
          setIsJoining,
          setLockWithTimeout,
          releaseLock,
          isLocked,
          cleanupAllStreams,
          handleSecondaryCamera,
          selectedSecondaryDevice,
        } = get();

        // Use the new centralized lock to prevent concurrent joins.
        if (isLocked("join")) {
          console.log("Join already in progress, skipping...");
          return;
        }
        if (!socket) {
          toast.error("Socket not connected, Please Refresh your page!");
          return;
        }

        // Acquire lock and set UI state. The lock will auto-release on timeout.
        setLockWithTimeout("join");
        setIsJoining(true);

        try {
          cleanupAllStreams(); // Ensure state is clean before joining.

          set({
            lastRoomName: roomName,
            lastUserData: userData,
            lastPeerId: peerId,
            lastLiveRole: live_role,
          });

          socket.emit(
            "joinRoom",
            { roomName, userData, peerId },
            async (data: JOIN_ROOM_RESPONSE_TYPE) => {
              if (data.error) {
                toast.error("Failed to join room: " + data.error);
                setIsJoining(false);
                releaseLock("join");
                if (!isLocal())
                  Sentry.captureException(data.error, {
                    tags: {
                      operation: "joinRoom",
                      errorType: "connect_error",
                    },
                    level: "error",
                  });
                return;
              }

              try {
                const device = new mediasoupClient.Device();
                get().setDeviceRef(device);
                await device.load({
                  routerRtpCapabilities: data.rtpCapabilities,
                });

                if (live_role !== "Admin")
                  await createSendTransport(roomName);
                await createRecvTransport();

                data.producersData?.forEach((p) => {
                  get().addAvailableProducer(
                    p.producerId,
                    p.userData,
                    p.kind || "video"
                  );
                  consume(p.producerId);
                });

                await handleCameraChange();
                get().setIsRoomJoined(true);
                set({ isReconnecting: false, reconnectAttempts: 0 });
                toast.success("Room joined!");
                get().monitorConnectionHealth();
              } catch (error) {
                console.error(error);
                toast.error("Failed to set up media devices.");
                if (peerId && userData?.id) {
                  console.log(
                    `Media setup failed for user ${userData.id}, attempting to refresh.`
                  );
                  get().handleRefreshStudent(peerId, userData.id);
                }
              } finally {
                if (selectedSecondaryDevice) {
                  console.log(selectedSecondaryDevice, "secdev");
                  await handleSecondaryCamera(selectedSecondaryDevice);
                }

                setIsJoining(false);
                releaseLock("join");
              }
            }
          );
        } catch (error) {
          console.error("Error during join:", error);
          setIsJoining(false);
          releaseLock("join");
          if (!isLocal())
            Sentry.captureException(error, {
              tags: {
                operation: "handleJoin",
                roomName,
                live_role,
              },
              contexts: {
                room: { roomName, peerId },
                user: { id: userData.id, role: live_role },
              },
            });
        }
      },
      handleLeaveRoom: () => {
        get()._resetConnectionState(false);
      },
      handleScreenChange: async () => {
        const {
          selectedDevice,
          videoProducerRef,
          sendTransportRef,
          updateLocalVideo,
          setVideoProducerRef,
        } = get();
        if (!selectedDevice) return;

        try {
          const stream = await navigator.mediaDevices.getDisplayMedia();
          const videoTrack = stream.getVideoTracks()[0];

          if (videoProducerRef) {
            await videoProducerRef.replaceTrack({ track: videoTrack });
          } else {
            const newProducer = await sendTransportRef!.produce({
              track: videoTrack,
              encodings: [
                {
                  rid: "r0",
                  maxBitrate: 250000,
                  scaleResolutionDownBy: 4,
                  maxFramerate: 10,
                },
                {
                  rid: "r1",
                  maxBitrate: 800000,
                  scaleResolutionDownBy: 2,
                  maxFramerate: 10,
                },
                {
                  rid: "r2",
                  maxBitrate: 2000000,
                  scaleResolutionDownBy: 1,
                  maxFramerate: 15,
                },
              ],
              codecOptions: {
                videoGoogleStartBitrate: 2000,
                videoGoogleMinBitrate: 1000,
                videoGoogleMaxBitrate: 2500,
              },
            });
            setVideoProducerRef(newProducer);
          }
          updateLocalVideo(stream);
        } catch (error: any) {
          console.error("Error switching webcam:", error);

          // More specific error handling
          if (error.name === "NotFoundError") {
            toast.error("Camera not found. Please check if it's connected.");
          } else if (error.name === "NotAllowedError") {
            toast.error(
              "Camera access denied. Please allow camera permissions."
            );
          } else if (error.name === "NotReadableError") {
            toast.error("Camera is already in use by another application.");
          } else {
            toast.error("Failed to switch camera");
          }
        }
      },
      handleCameraChange: async () => {
        const {
          selectedDevice,
          videoProducerRef,
          sendTransportRef,
          updateLocalVideo,
          setVideoProducerRef,
        } = get();
        if (!selectedDevice) return;

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: selectedDevice },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { max: 30 },
            },
          });
          const videoTrack = stream.getVideoTracks()[0];

          if (videoProducerRef) {
            await videoProducerRef.replaceTrack({ track: videoTrack });
          } else {
            const newProducer = await sendTransportRef!.produce({
              track: videoTrack,
              encodings: [
                {
                  rid: "r0",
                  maxBitrate: 250000,
                  scaleResolutionDownBy: 4,
                  maxFramerate: 10,
                },
                {
                  rid: "r1",
                  maxBitrate: 800000,
                  scaleResolutionDownBy: 2,
                  maxFramerate: 10,
                },
                {
                  rid: "r2",
                  maxBitrate: 2000000,
                  scaleResolutionDownBy: 1,
                  maxFramerate: 15,
                },
              ],
              codecOptions: {
                videoGoogleStartBitrate: 2000,
                videoGoogleMinBitrate: 1000,
                videoGoogleMaxBitrate: 2500,
              },
              appData: {
                cameraType: "primary",
              },
            });
            setVideoProducerRef(newProducer);
          }
          updateLocalVideo(stream);
        } catch (error: any) {
          console.error("Error switching webcam:", error);

          // More specific error handling
          if (error.name === "NotFoundError") {
            toast.error("Camera not found. Please check if it's connected.");
          } else if (error.name === "NotAllowedError") {
            toast.error(
              "Camera access denied. Please allow camera permissions."
            );
          } else if (error.name === "NotReadableError") {
            toast.error("Camera is already in use by another application.");
          } else {
            toast.error("Failed to switch camera");
          }
        }
      },
      handleSecondaryCamera: async (deviceId: string) => {
        const {
          sendTransportRef,
          setSecondaryVideo,
          setSecondaryProducerRef,
          setIsSecondaryStreaming,
          setSelectedSecondaryDevice,
          secondaryVideo,
          secondaryProducerRef,
          socket,
        } = get();

        if (!sendTransportRef) {
          toast.error("Not connected to room");
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { max: 30 },
            },
          });

          const videoTrack = stream.getVideoTracks()[0];
          const newProducer = await sendTransportRef.produce({
            track: videoTrack,
            encodings: [
              {
                rid: "r0",
                maxBitrate: 250000,
                scaleResolutionDownBy: 4,
                maxFramerate: 10,
              },
              {
                rid: "r1",
                maxBitrate: 800000,
                scaleResolutionDownBy: 2,
                maxFramerate: 10,
              },
              {
                rid: "r2",
                maxBitrate: 2000000,
                scaleResolutionDownBy: 1,
                maxFramerate: 15,
              },
            ],
            codecOptions: {
              videoGoogleStartBitrate: 2000,
              videoGoogleMinBitrate: 1000,
              videoGoogleMaxBitrate: 2500,
            },
            appData: { cameraType: "secondary" }, // Add metadata
          });

          setSecondaryProducerRef(newProducer);
          setSecondaryVideo(stream);
          setSelectedSecondaryDevice(deviceId);
          setIsSecondaryStreaming(true);
          toast.success("Webcam started!");
        } catch (error) {
          console.error("Error starting Webcam:", error);
          toast.error("Failed to start Webcam");
          setIsSecondaryStreaming(false);
          setSelectedSecondaryDevice("");
          if (secondaryVideo) {
            secondaryVideo.getTracks().forEach((track) => track.stop());
            setSecondaryVideo(undefined);
          }
          if (secondaryProducerRef) {
            secondaryProducerRef.close();
            setSecondaryProducerRef(null);
            ws.emit("closeProducer", { producerId: secondaryProducerRef.id });
          }
        }
      },

      stopSecondaryCamera: async () => {
        const {
          secondaryProducerRef,
          secondaryVideo,
          setSecondaryVideo,
          setSecondaryProducerRef,
          setIsSecondaryStreaming,
          setSelectedSecondaryDevice,
        } = get();

        if (secondaryProducerRef) {
          secondaryProducerRef.close();
          setSecondaryProducerRef(null);
          ws.emit("closeProducer", { producerId: secondaryProducerRef.id });
        }

        if (secondaryVideo) {
          secondaryVideo.getTracks().forEach((track) => track.stop());
          setSecondaryVideo(undefined);
        }

        setSelectedSecondaryDevice("");
        setIsSecondaryStreaming(false);
        toast.success("Webcam stopped");
      },
      // New reconnection actions
      setIsReconnecting: (status) => set({ isReconnecting: status }),
      setReconnectAttempts: (attempts) => set({ reconnectAttempts: attempts }),
      setConnectionQuality: (quality) => {
        const prevQuality = get().connectionQuality;
        if (!isLocal()) {
          Sentry.addBreadcrumb({
            category: "connection",
            message: `Connection quality changed: ${prevQuality} → ${quality}`,
            level: "info",
            data: {
              previousQuality: prevQuality,
              newQuality: quality,
              socketStatus: get().socketStatus,
              sendTransportStatus: get().sendTransportStatus,
              recvTransportStatus: get().recvTransportStatus,
            },
          });
        }

        set({ connectionQuality: quality });

        // Alert on critical quality degradation
        if (
          quality === "disconnected" &&
          prevQuality !== "disconnected" &&
          !isLocal()
        ) {
          Sentry.captureMessage("Connection lost", {
            level: "error",
            tags: { connectionQuality: quality },
          });
        }
      },

      startHeartbeat: () => {
        const { stopHeartbeat } = get();
        stopHeartbeat(); // Clear any existing interval

        const interval = setInterval(() => {
          const { socket, isConnected } = get();
          if (socket && isConnected) {
            socket.emit("heartbeat-response", {
              timestamp: Date.now(),
              quality: get().connectionQuality,
            });
          }
        }, 30000);

        set({ heartbeatInterval: interval });
      },

      stopHeartbeat: () => {
        const { heartbeatInterval } = get();
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          set({ heartbeatInterval: null });
        }
      },

      setupSocketEventHandlers: () => {
        const { socket } = get();
        if (!socket) return;

        // Enhanced connection handling
        socket.on("connect", () => {
          console.log("Connected to signaling server:", socket.id);
          set({ isConnected: true, reconnectAttempts: 0 });
          get().updateConnectionStatus();
          get().startHeartbeat();

          // Centralized rejoin logic. This is the single source of truth for rejoining.
          const { lastRoomName, lastUserData, lastPeerId, lastLiveRole } =
            get();
          if (lastRoomName && lastUserData && lastPeerId) {
            console.log("Socket connected, auto-rejoining room...");
            get().handleJoin(
              lastRoomName,
              lastUserData,
              lastPeerId,
              lastLiveRole
            );
          }
          // Whether we rejoin or not, the reconnection attempt is over.
          set({ isReconnecting: false });
        });

        socket.on("disconnect", (reason) => {
          console.log("Disconnected from signaling server:", reason);
          set({ isConnected: false });
          get().updateConnectionStatus();
          get()._resetConnectionState(true);

          if (
            ["transport close", "transport error", "ping timeout"].includes(
              reason
            )
          ) {
            get().handleDisconnection();
          }
        });

        socket.on("connect_error", (error) => {
          console.error("Connection error:", error);
          get().updateConnectionStatus();
          get().handleDisconnection();
        });

        // Heartbeat from server
        socket.on("heartbeat", (data) => {
          socket.emit("heartbeat-response", {
            timestamp: Date.now(),
            receivedAt: data.timestamp,
            quality: get().connectionQuality,
          });
        });
      },

      handleDisconnection: () => {
        if (get().isReconnecting || get().isLocked("disconnect")) return;

        get().setLockWithTimeout("disconnect", get().reconnectDelay + 1000);

        set({ isReconnecting: true });
        const newAttempts = get().reconnectAttempts + 1;
        set({ reconnectAttempts: newAttempts });

        if (newAttempts <= get().maxReconnectAttempts) {
          // Exponential backoff for retries
          const delay = get().reconnectDelay * Math.pow(2, newAttempts - 1);
          console.log(
            `Attempting reconnection in ${delay}ms... (${newAttempts}/${
              get().maxReconnectAttempts
            })`
          );
          setTimeout(() => {
            get().attemptReconnection();
            get().releaseLock("disconnect");
          }, delay);
          toast.info(`Connection lost. Reconnecting... (${newAttempts})`);
        } else {
          console.error("Max reconnection attempts reached.");
          toast.error("Connection failed. Please refresh the page.");
          set({ isReconnecting: false });
          get().releaseLock("disconnect");
        }
      },

      restoreConnection: async () => {
        try {
          const {
            lastRoomName,
            lastUserData,
            lastPeerId,
            lastLiveRole,
            selectedDevice,
          } = get();

          // Recreate transports
          if (lastLiveRole !== "Admin") {
            try {
              console.log(lastUserData, lastPeerId, "last data");
              await createSendTransport(lastRoomName);
            } catch (err) {
              console.log(err, "ERR TERAKHIR DISINI");
            }
          }
          await createRecvTransport();

          // Restore media if we had a selected device
          if (selectedDevice) {
            await get().handleCameraChange();
          }

          console.log("Connection restored successfully");
          toast.success("Connection restored!");
        } catch (error) {
          console.error("Failed to restore connection:", error);
          toast.error("Failed to restore connection");
        }
      },

      handleTransportFailure: async (transportType: "send" | "receive") => {
        const {
          setLockWithTimeout,
          releaseLock,
          isLocked,
          lastRoomName,
          lastUserData,
          lastPeerId,
          lastLiveRole,
        } = get();
        if (!isLocal()) {
          Sentry.captureMessage(`Transport failure: ${transportType}`, {
            level: "warning",
            tags: {
              transportType,
              connectionQuality: get().connectionQuality,
            },
          });
        }
        if (isLocked("transport")) return;
        setLockWithTimeout("transport", 20000);
        get().setConnectionQuality("poor");

        try {
          console.log(`Closing failed ${transportType} transport.`);
          if (transportType === "send") {
            get().sendTransportRef?.close();
            set({ sendTransportRef: null, videoProducerRef: null });
            if (lastRoomName) {
              await createSendTransport(lastRoomName);
              await get().handleCameraChange();
              if (get().selectedSecondaryDevice)
                await get().handleSecondaryCamera(
                  get().selectedSecondaryDevice
                );
            }
          } else {
            // receive
            get().recvTransportRef?.close();
            set({ recvTransportRef: null });
            get().cleanupAllStreams();
            await createRecvTransport();
            await get().reconsumeAllProducers();
          }
          console.log(`${transportType} transport recovery completed.`);
          get().updateConnectionStatus();
          toast.success(`Connection restored`);
        } catch (error) {
          console.error(
            `${transportType} transport recovery failed, attempting full rejoin:`,
            error
          );
          get()._resetConnectionState(true);
          if (lastRoomName && lastUserData && lastPeerId) {
            await get().handleJoin(
              lastRoomName,
              lastUserData,
              lastPeerId,
              lastLiveRole
            );
          } else {
            get().handleDisconnection(); // Fallback to socket reconnection
          }
        } finally {
          releaseLock("transport");
        }
      },

      attemptReconnection: async () => {
        const { socket, isReconnecting } = get();
        // Its only job is to try to connect the socket. The `on('connect')` handler will do the rest.
        if (isReconnecting && socket && !socket.connected) {
          console.log("Attempting to manually connect socket...");
          socket.connect();
        }
      },

      monitorConnectionHealth: () => {
        // Monitor connection quality based on various metrics
        setInterval(() => {
          const { socket, sendTransportRef, recvTransportRef } = get();

          if (!socket?.connected) {
            set({ connectionQuality: "disconnected" });
            return;
          }

          // Check transport states
          const sendState = sendTransportRef?.connectionState;
          const recvState = recvTransportRef?.connectionState;

          if (sendState === "failed" || recvState === "failed") {
            set({ connectionQuality: "poor" });
          } else if (sendState === "connecting" || recvState === "connecting") {
            set({ connectionQuality: "good" });
          } else if (sendState === "connected" && recvState === "connected") {
            set({ connectionQuality: "excellent" });
          }
        }, 5000);
      },
      handleNuke: () => {
        get().socket?.disconnect();
      },
      getTransportStats: async (transportType: "send" | "receive") => {
        const { sendTransportRef, recvTransportRef } = get();

        try {
          if (transportType === "send") {
            if (!sendTransportRef) {
              console.warn("Send transport is not available.");
              return null;
            }
            return await sendTransportRef.getStats();
          }

          if (transportType === "receive") {
            if (!recvTransportRef) {
              console.warn("Receive transport is not available.");
              return null;
            }
            return await recvTransportRef.getStats();
          }

          console.error("Invalid transport type specified.");
          return null;
        } catch (error) {
          console.error(
            `Error getting stats for ${transportType} transport:`,
            error
          );
          return null;
        }
      },
      // Lock management helpers
      setLockWithTimeout: (lockName: string, timeoutMs?: number) => {
        const {
          locks,
          lockTimers,
          lockTimeoutMs,
          releaseLock,
          handleRefreshStudent,
          lastPeerId,
          lastUserData,
        } = get();
        if (locks.has(lockName)) {
          console.warn(`Lock "${lockName}" is already held.`);
          return false; // Indicate that lock was not acquired
        }

        const newLocks = new Set(locks).add(lockName);
        set({ locks: newLocks });

        const existingTimer = lockTimers.get(lockName);
        if (existingTimer) clearTimeout(existingTimer);

        const timeout = timeoutMs || lockTimeoutMs;
        const timer = setTimeout(() => {
          console.warn(`Lock "${lockName}" timed out after ${timeout}ms.`);
          releaseLock(lockName);
          toast.warning("Connection recovery timed out.");
          if (lastPeerId && lastUserData)
            handleRefreshStudent(lastPeerId, lastUserData.id);
        }, timeout);

        lockTimers.set(lockName, timer);
        set({ lockTimers: new Map(lockTimers) });
        return true; // Indicate success
      },
      releaseLock: (lockName: string) => {
        const { locks, lockTimers } = get();

        const timer = lockTimers.get(lockName);
        if (timer) {
          clearTimeout(timer);
          lockTimers.delete(lockName);
        }

        const newLocks = new Set(locks);
        if (newLocks.delete(lockName)) {
          set({ locks: newLocks, lockTimers: new Map(lockTimers) });
          console.log(`Lock "${lockName}" released`);
        }
      },
      releaseAllLocks: () => {
        get().lockTimers.forEach((timer) => clearTimeout(timer));
        set({ locks: new Set(), lockTimers: new Map() });
        console.log("All locks released");
      },
      isLocked: (lockName: string) => {
        return get().locks.has(lockName);
      },
      updateConnectionStatus: () => {
        const {
          socket,
          sendTransportRef,
          recvTransportRef,
          handleTransportFailure,
          handleDisconnection,
        } = get();
        const socketStatus = socket?.connected ? "connected" : "disconnected";
        const sendTransportStatus =
          sendTransportRef?.connectionState || "closed";
        const recvTransportStatus =
          recvTransportRef?.connectionState || "closed";

        let quality: StreamState["connectionQuality"] = "excellent";
        if (socketStatus === "disconnected") {
          quality = "disconnected";
        } else if (
          sendTransportStatus === "failed" ||
          recvTransportStatus === "failed" ||
          sendTransportStatus === "disconnected" ||
          recvTransportStatus === "disconnected"
        ) {
          quality = "poor";
        } else if (
          sendTransportStatus === "connecting" ||
          recvTransportStatus === "connecting"
        ) {
          quality = "good";
        }

        set({
          socketStatus,
          sendTransportStatus,
          recvTransportStatus,
          connectionQuality: quality,
        });

        if (
          sendTransportStatus === "failed" ||
          sendTransportStatus === "disconnected"
        ) {
          console.warn(
            "Status check detected failed SEND transport. Attempting recovery."
          );
          handleTransportFailure("send");
        }
        if (
          recvTransportStatus === "failed" ||
          recvTransportStatus === "disconnected"
        ) {
          console.warn(
            "Status check detected failed RECV transport. Attempting recovery."
          );
          handleTransportFailure("receive");
        }

        // 2. Check for socket disconnection. This triggers the graceful reconnection process.
        if (socketStatus === "disconnected") {
          console.warn(
            "Status check detected disconnected socket. Attempting graceful reconnection."
          );
          handleDisconnection();
        }
      },
      setLocalAudio: (stream) => set({ localAudio: stream }),
      setAudioProducerRef: (ref) => set({ audioProducerRef: ref }),
      setIsMicMuted: (muted) => set({ isMicMuted: muted }),
      setAudioDevices: (devices) => set({ audioDevices: devices }),
      setSelectedAudioDevice: (deviceId) =>
        set({ selectedAudioDevice: deviceId }),

      addRemoteAudioStream: (consumerId, stream) => {
        const { remoteAudioStreams } = get();
        remoteAudioStreams.set(consumerId, stream);
        set({ remoteAudioStreams: new Map(remoteAudioStreams) });
      },

      removeRemoteAudioStream: (consumerId) => {
        const { remoteAudioStreams } = get();
        remoteAudioStreams.delete(consumerId);
        set({ remoteAudioStreams: new Map(remoteAudioStreams) });
      },

      startAudioProduction: async () => {
        const {
          selectedAudioDevice,
          sendTransportRef,
          setAudioProducerRef,
          setLocalAudio,
          setIsMicMuted,
        } = get();
console.log("Video producer before audio:", get().videoProducerRef?.id, get().videoProducerRef?.closed);
        if (!sendTransportRef) {
          toast.error("Not connected to room");
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedAudioDevice
                ? { exact: selectedAudioDevice }
                : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          const audioTrack = stream.getAudioTracks()[0];

          const producer = await sendTransportRef.produce({
            track: audioTrack,
            appData: { mediaType: "audio" },
          });
console.log("Video producer after audio:", get().videoProducerRef?.id, get().videoProducerRef?.closed);
          setAudioProducerRef(producer);
          setLocalAudio(stream);
          setIsMicMuted(false);

          producer.on("transportclose", () => {
            console.log("Audio producer transport closed");
            get().stopAudioProduction();
          });

          toast.success("Microphone enabled");
        } catch (error: any) {
          console.error("Error starting audio:", error);
          if (error.name === "NotAllowedError") {
            toast.error("Microphone access denied");
          } else if (error.name === "NotFoundError") {
            toast.error("No microphone found");
          } else {
            toast.error("Failed to start microphone");
          }
        }
      },

      stopAudioProduction: () => {
        const {
          audioProducerRef,
          localAudio,
          setAudioProducerRef,
          setLocalAudio,
          setIsMicMuted,
        } = get();

        if (audioProducerRef) {
          audioProducerRef.close();
          setAudioProducerRef(null);
          ws.emit("closeProducer", { producerId: audioProducerRef.id });
        }

        if (localAudio) {
          localAudio.getTracks().forEach((track) => track.stop());
          setLocalAudio(undefined);
        }

        setIsMicMuted(true);
        toast.success("Microphone disabled");
      },

      handleAudioToggle: async () => {
        const { isMicMuted, audioProducerRef } = get();

        if (isMicMuted || !audioProducerRef) {
          await get().startAudioProduction();
        } else {
          get().stopAudioProduction();
        }
      },

      handleAudioDeviceChange: async () => {
        const {
          selectedAudioDevice,
          audioProducerRef,
          sendTransportRef,
          setLocalAudio,
        } = get();

        if (!selectedAudioDevice || !sendTransportRef) return;

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: selectedAudioDevice },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          const audioTrack = stream.getAudioTracks()[0];

          if (audioProducerRef) {
            await audioProducerRef.replaceTrack({ track: audioTrack });
          }

          setLocalAudio(stream);
          toast.success("Microphone changed");
        } catch (error) {
          console.error("Error changing microphone:", error);
          toast.error("Failed to change microphone");
        }
      },
    };
  });
};
