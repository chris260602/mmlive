import {
  REMOTE_STREAM_TYPE,
  requestMediaPermission,
} from "@/utils/deviceUtils";
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
  isPrimaryDeviceLoading: boolean;
  selectedDevice: string;
  selectedSecondaryDevice: string;
  isLocalView: boolean;
  socket: Socket | null; // To hold the WebSocket instance
  videoRef: HTMLVideoElement | null; // To hold a ref to a <video> element
  remoteStreams: REMOTE_STREAM_TYPE[];
  sendTransportRef: Transport<AppData> | null;
  recvTransportRef: Transport<AppData> | null;
  secondarySendTransportRef: Transport<AppData> | null;
  videoProducerRef: Producer<AppData> | null;
  secondaryProducerRef: Producer<AppData> | null;
  deviceRef?: mediasoupClient.types.Device;
  videoDevices: REMOTE_STREAM_TYPE[];
  isSecondaryStreaming: boolean;
  cameraViewMode: "primary" | "secondary" | "both";
  isLoadingSecondaryCamera: boolean;
  // Producer tracking for reconnection
  availableProducers: Map<string, { userData: USER_DATA_TYPE; kind: string }>;
  activeConsumers: Map<
    string,
    { producerId: string; consumerId: string; userData: USER_DATA_TYPE }
  >;
  pendingConsumers: Set<string>;

  // Screen sharing state
  isScreenSharing: boolean;
  screenShareStream?: MediaStream;
  screenProducerRef: Producer<AppData> | null;
  secondaryMode: "camera" | "screen";
  isLoadingScreenSharing: boolean;
  screenAudioProducerRef: Producer<AppData> | null;

  // Swap State
  swappedCameras: Set<string>;

  // Audio
  localAudio?: MediaStream;
  audioProducerRef: Producer<AppData> | null;
  isMicMuted: boolean;
  audioDevices: MediaDeviceInfo[];
  selectedAudioDevice: string;
  oldAudioDevice: string;
  remoteAudioStreams: Map<string, MediaStream>;
  isLoadingMic: boolean;

  // Audio Output
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioOutputDevice: string;
  oldAudioOutputDevice: string;

  // Speaking detection
  mutedStudents: Map<string, boolean>;

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
  setIsPrimaryDeviceLoading: (status: boolean) => void;
  setLocalVideo: (stream: MediaStream) => void;
  setSecondaryVideo: (stream: MediaStream | undefined) => void;
  setIsLocalView: (status: boolean) => void;
  setRemoteStreams: (streams: REMOTE_STREAM_TYPE[]) => void;
  removeRemoteStream: (consumerId: string) => void;
  setDeviceRef: (device: mediasoupClient.types.Device) => void;
  setVideoProducerRef: (ref: Producer<AppData>) => void;
  setSecondaryProducerRef: (ref: Producer<AppData> | null) => void;
  setSendTransportRef: (ref: Transport<AppData>) => void;
  setRecvTransportRef: (ref: Transport<AppData>) => void;
  setSecondarySendTransportRef: (ref: Transport<AppData> | null) => void;
  updateLocalVideo: (newStream: MediaStream) => void;
  addRemoteStream: (remoteStream: REMOTE_STREAM_TYPE) => void;
  setVideoDevices: (devices: REMOTE_STREAM_TYPE[]) => void;
  setSelectedDevice: (device: string) => void;
  setSelectedSecondaryDevice: (device: string) => void;
  setIsSecondaryStreaming: (status: boolean) => void;
  handleRefreshStudent: (peerId: string, userId: string) => void;
  handleKickStudent: (peerId: string, userId: string) => void;
  handleMuteStudent: (peerId: string, userId: string) => void;
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
  setIsLoadingSecondaryCamera: (isLoading: boolean) => void;

  // swap actions
  toggleCameraSwap: (userId: string) => void;
  isCameraSwapped: (userId: string) => boolean;

  // Screen sharing actions
  setIsScreenSharing: (status: boolean) => void;
  setScreenShareStream: (stream: MediaStream | undefined) => void;
  setScreenProducerRef: (ref: Producer<AppData> | null) => void;
  setSecondaryMode: (mode: "camera" | "screen") => void;
  handleScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  toggleSecondaryMode: (mode: "camera" | "screen") => Promise<void>;
  setIsLoadingScreenSharing: (status: boolean) => void;
  setScreenAudioProducerRef: (ref: Producer<AppData> | null) => void;
  startScreenAudioProduction: (audioTrack: MediaStreamTrack) => Promise<void>;
  stopScreenAudioProduction: () => void;

  // Audio actions
  setLocalAudio: (stream: MediaStream | undefined) => void;
  setAudioProducerRef: (ref: Producer<AppData> | null) => void;
  setIsMicMuted: (muted: boolean) => void;
  setAudioDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedAudioDevice: (deviceId: string) => void;
  setOldAudioDevice: (deviceId: string) => void;
  handleAudioToggle: () => Promise<void>;
  handleAudioDeviceChange: () => Promise<void>;
  startAudioProduction: () => Promise<void>;
  stopAudioProduction: () => void;
  addRemoteAudioStream: (consumerId: string, stream: MediaStream) => void;
  removeRemoteAudioStream: (consumerId: string) => void;
  setIsLoadingMic: (isLoading: boolean) => void;
  waitForTransportConnection: (
    transport: Transport<AppData>,
    timeoutMs?: number
  ) => Promise<void>;

  // ⭐ Audio output actions
  setAudioOutputDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedAudioOutputDevice: (deviceId: string) => void;
  setOldAudioOutputDevice: (deviceId: string) => void;
  handleAudioOutputChange: () => Promise<void>;
  applyAudioOutputToAllElements: (deviceId: string) => Promise<void>;

  // Speaking detection actions
  setStudentMuteStatus: (userId: string, isMuted: boolean) => void;

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
    isLocalView: false,
    isPrimaryDeviceLoading: false,
    socket: null,
    videoRef: null,
    remoteStreams: [],
    sendTransportRef: null,
    recvTransportRef: null,
    secondarySendTransportRef: null,
    videoProducerRef: null,
    secondaryProducerRef: null,
    videoDevices: [],
    isSecondaryStreaming: false,
    cameraViewMode: "both",
    isLoadingSecondaryCamera: false,
    // Swap
    swappedCameras: new Set<string>(),
    // Secondary
    isScreenSharing: false,
    screenProducerRef: null,
    secondaryMode: "camera",
    isLoadingScreenSharing: false,
    screenAudioProducerRef: null,
    // Audio
    audioProducerRef: null,
    isMicMuted: true,
    audioDevices: [],
    selectedAudioDevice: "",
    oldAudioDevice: "",
    remoteAudioStreams: new Map(),
    isLoadingMic: false,

    // Audio output
    audioOutputDevices: [],
    selectedAudioOutputDevice: "",
    oldAudioOutputDevice: "",

    // speaking detection
    mutedStudents: new Map<string, boolean>(),

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
  isPrimaryDeviceLoading: false,
  isRoomJoined: false,
  selectedDevice: "",
  selectedSecondaryDevice: "",
  isLocalView: false,
  socket: null,
  videoRef: null,
  remoteStreams: [],
  sendTransportRef: null,
  recvTransportRef: null,
  secondarySendTransportRef: null,
  videoProducerRef: null,
  secondaryProducerRef: null,
  videoDevices: [],
  isSecondaryStreaming: false,
  cameraViewMode: "both",
  isLoadingSecondaryCamera: false,
  // swap
  swappedCameras: new Set<string>(),
  // Secondary
  isScreenSharing: false,
  screenProducerRef: null,
  secondaryMode: "camera",
  isLoadingScreenSharing: false,
  screenAudioProducerRef: null,
  // Audio
  audioProducerRef: null,
  isMicMuted: true,
  audioDevices: [],
  selectedAudioDevice: "",
  oldAudioDevice: "",
  remoteAudioStreams: new Map(),
  isLoadingMic: false,

  // Audio output
  audioOutputDevices: [],
  selectedAudioOutputDevice: "",
  oldAudioOutputDevice: "",

  // Speaking detection
  mutedStudents: new Map<string, boolean>(),

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
                      else {
                        callback();
                        set({ sendTransportRef: transport });
                      }
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
              set({ sendTransportRef: transport });
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
    const createSecondaryTransport = async () => {
      const { socket, deviceRef, setSecondarySendTransportRef } = get();
      const { roomId } = userStoreApi.getState(); // Get room from user store

      if (!socket || !deviceRef) {
        toast.error(
          "Cannot create secondary transport: socket or device not available"
        );
        return null;
      }

      return new Promise((resolve, reject) => {
        console.info("Creating secondary send transport", {
          socketId: socket.id,
        });

        socket.emit(
          "createWebRtcTransport",
          { isSender: true, isSecondary: true },
          (response: any) => {
            if (response.error) {
              toast.error("Failed to create secondary transport", {
                error: response.error,
              });
              reject(new Error(response.error));
              return;
            }

            try {
              const { params } = response;
              const transport = deviceRef.createSendTransport(params);

              transport.on("connectionstatechange", (state) => {
                console.debug("Secondary transport connection state:", {
                  state,
                });

                if (
                  state === "failed" ||
                  state === "disconnected" ||
                  state === "closed"
                ) {
                  console.warn("Secondary transport failed", { state });
                  toast.warning("Webcam connection issue");
                }
              });

              transport.on(
                "connect",
                async ({ dtlsParameters }, callback, errback) => {
                  socket.emit(
                    "connectTransport",
                    { transportId: transport.id, dtlsParameters },
                    (data: any) => {
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
                    socket.emit(
                      "produce",
                      {
                        transportId: transport.id,
                        kind,
                        rtpParameters,
                        roomName: roomId, // Use roomId from user store
                        appData,
                      },
                      (data: any) => {
                        if (data.error) errback(new Error(data.error));
                        else callback({ id: data.id });
                      }
                    );
                  } catch (error) {
                    errback(error);
                  }
                }
              );

              setSecondarySendTransportRef(transport);
              console.info("Secondary transport created", {
                transportId: transport.id,
              });

              resolve(transport);
            } catch (error) {
              toast.error("Error creating secondary transport", { error });
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
      setIsPrimaryDeviceLoading: (status) =>
        set({ isPrimaryDeviceLoading: status }),
      setLocalVideo: (stream) => set({ localVideo: stream }),
      setSecondaryVideo: (stream) => set({ secondaryVideo: stream }),
      setIsLocalView: (view) => set({ isLocalView: view }),
      setRemoteStreams: (streams) => set({ remoteStreams: streams }),
      setDeviceRef: (device) => set({ deviceRef: device }),
      setVideoProducerRef: (ref) => set({ videoProducerRef: ref }),
      setSecondaryProducerRef: (ref) => set({ secondaryProducerRef: ref }),
      setSendTransportRef: (ref) => set({ sendTransportRef: ref }),
      setRecvTransportRef: (ref) => set({ recvTransportRef: ref }),
      setSecondarySendTransportRef: (ref) =>
        set({ secondarySendTransportRef: ref }),
      setVideoDevices: (devices) => set({ videoDevices: devices }),
      setSelectedDevice: (device) => set({ selectedDevice: device }),
      setSelectedSecondaryDevice: (device) =>
        set({ selectedSecondaryDevice: device }),
      setIsSecondaryStreaming: (status) =>
        set({ isSecondaryStreaming: status }),
      setCameraViewMode: (mode) => set({ cameraViewMode: mode }),
      setIsLoadingSecondaryCamera: (isLoading) =>
        set({ isLoadingSecondaryCamera: isLoading }),
      setIsLoadingMic: (isLoading) => set({ isLoadingMic: isLoading }),
      // Secondary
      setIsScreenSharing: (status) => set({ isScreenSharing: status }),
      setIsLoadingScreenSharing: (status) =>
        set({ isLoadingScreenSharing: status }),
      setScreenShareStream: (stream) => set({ screenShareStream: stream }),
      setScreenProducerRef: (ref) => set({ screenProducerRef: ref }),
      setScreenAudioProducerRef: (ref) => set({ screenAudioProducerRef: ref }),
      setSecondaryMode: (mode) => set({ secondaryMode: mode }),
      _resetConnectionState: (isForRecovery: boolean) => {
        const {
          socket,
          sendTransportRef,
          recvTransportRef,
          secondarySendTransportRef,
          localVideo,
          stopHeartbeat,
          secondaryVideo,
          localAudio,
          stopScreenAudioProduction,
        } = get();
        console.log(
          `Resetting connection state. For recovery: ${isForRecovery}`
        );

        stopHeartbeat();

        // Only tell the server we're leaving on a clean, user-initiated exit.
        if (socket?.connected && !isForRecovery) {
          socket.emit("leaveRoom");
          if (get().secondaryProducerRef) get().stopSecondaryCamera();
          stopScreenAudioProduction();
        }

        // Safely close all transports and producers
        if (sendTransportRef) sendTransportRef.close();
        if (recvTransportRef) recvTransportRef.close();
        if (secondarySendTransportRef) secondarySendTransportRef.close();
        if (localVideo) localVideo.getTracks().forEach((track) => track.stop());
        if (secondaryVideo)
          secondaryVideo.getTracks().forEach((track) => track.stop());
        if (localAudio) localAudio.getTracks().forEach((track) => track.stop());

        const baseReset = {
          sendTransportRef: null,
          recvTransportRef: null,
          secondarySendTransportRef: null,
          videoProducerRef: null,
          secondaryProducerRef: null,
          isSecondaryStreaming: false,
          isLocalView: false,
          isRoomJoined: false,
          localVideo: undefined,
          audioProducerRef: null,
          screenAudioProducerRef: null,
          secondaryVideo: undefined,
          localAudio: undefined,
          remoteStreams: [],
          availableProducers: new Map(),
          activeConsumers: new Map(),
          pendingConsumers: new Set(),
          mutedStudents: new Map<string, boolean>(),
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
      handleMuteStudent: async (peerId: string, userId: string) => {
        ws.emit("mute-student-server", { peerId, userId });
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
          isRoomJoined,
          setStudentMuteStatus,
        } = get();
        const { userData: currentUser } = userStoreApi.getState();

        if (!isRoomJoined) {
          console.warn("Not in room, skipping consume");
          return;
        }
        let shouldProceed = false;
        console.log(producerId, "conprod");
        // Atomic check-and-set
        set((state) => {
          if (!state.isRoomJoined) {
            return state;
          }
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

        if (!recvTransportRef || (recvTransportRef as any)._closed) {
          console.error("Receive transport not available or closed");
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

              const isMuted = params.userData?.isMuted ?? true;
              const userId = params.userData?.id;

              if (userId) {
                setStudentMuteStatus(userId, isMuted);
                console.log(`Set initial mute state for ${userId}: ${isMuted}`);
              }

              // Track the active consumer
              addActiveConsumer(producerId, consumer.id, params.userData);

              if (params.kind === "audio") {
                // Add to remote audio streams
                addRemoteAudioStream(consumer.id, newStream);

                console.log(`Added remote audio stream: ${consumer.id}`);
              } else {
                const producerRole = params.userData?.live_role;
                const currentRole = currentUser?.live_role;

                let shouldDisplay = false;

                if (currentRole === "Admin") {
                  shouldDisplay = true;
                } else if (currentRole === "Teacher") {
                  shouldDisplay = producerRole === "Student";
                } else if (currentRole === "Student") {
                  shouldDisplay =
                    producerRole === "Teacher" || producerRole === "Admin";
                }

                if (shouldDisplay) {
                  addRemoteStream({
                    stream: newStream,
                    consumerId: consumer.id,
                    producerId: producerId,
                    userData: params.userData,
                    appData: { cameraType },
                  } as REMOTE_STREAM_TYPE);
                } else {
                  console.warn("Filtered out stream based on role", {
                    currentRole,
                    producerRole,
                    producerId,
                  });
                  // Close the consumer since we're not displaying it
                  consumer.close();
                  set((state) => {
                    const newPending = new Set(state.pendingConsumers);
                    newPending.delete(producerId);
                    return { pendingConsumers: newPending };
                  });
                  return;
                }

                // Handle video as before
                // addRemoteStream({
                //   stream: newStream,
                //   consumerId: consumer.id,
                //   producerId: producerId,
                //   userData: params.userData,
                //   appData: { cameraType },
                // } as REMOTE_STREAM_TYPE);
              }

              // Enhanced consumer event handling
              consumer.on("transportclose", () => {
                console.log(`Consumer transport closed: ${consumer.id}`);
                get().removeActiveConsumer(consumer.id);
                if (params.kind === "audio") {
                  get().removeRemoteAudioStream(consumer.id);
                } else {
                  get().removeRemoteStream(consumer.id);
                }
              });

              consumer.on("trackended", () => {
                console.log(`Consumer's producer closed: ${consumer.id}`);
                get().removeActiveConsumer(consumer.id);
                if (params.kind === "audio") {
                  get().removeRemoteAudioStream(consumer.id);
                } else {
                  get().removeRemoteStream(consumer.id);
                }
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
        if (oldStream && oldStream !== newStream) {
          console.log("Stopping old video tracks.");
          oldStream.getTracks().forEach((track) => {
            // Only stop tracks that are still live
            if (track.readyState === "live") {
              track.stop();
            }
          });
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
          waitForTransportConnection,
          setStudentMuteStatus,
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
                console.log("⏱️ Join room response received, setting up...");
                const startTime = Date.now();
                const device = new mediasoupClient.Device();
                get().setDeviceRef(device);
                await device.load({
                  routerRtpCapabilities: data.rtpCapabilities,
                });
                console.log(`⏱️ Device loaded in ${Date.now() - startTime}ms`);

                // ✅ Create transports
                // if (live_role !== "Admin")
                await createSendTransport(roomName);
                await createRecvTransport();

                // await new Promise((resolve) => setTimeout(resolve, 500));
                get().setIsRoomJoined(true);
                set({ isReconnecting: false, reconnectAttempts: 0 });

                data.producersData?.forEach((p) => {
                  get().addAvailableProducer(
                    p.producerId,
                    p.userData,
                    p.kind || "video"
                  );
                  console.log(p, "userdata");
                  const isMuted = p.userData?.isMuted ?? true;
                  get().setStudentMuteStatus(p.userData.id, isMuted);
                  consume(p.producerId);
                });
                if (live_role === "Student" || live_role === "Teacher") {
                  try {
                    const { sendTransportRef } = get();
                    if (!sendTransportRef) {
                      throw new Error("Send transport not ready");
                    }

                    if ((sendTransportRef as any)._closed) {
                      throw new Error("Send transport is closed");
                    }
                    await waitForTransportConnection(sendTransportRef);
                    await new Promise((resolve) => setTimeout(resolve, 500));

                    await handleCameraChange();
                    console.log("✅ Camera started successfully");
                  } catch (cameraError) {
                    console.error("❌ Failed to start camera:", cameraError);
                    // Don't fail the entire join, just notify user
                    toast.error(
                      "Failed to start camera. You can retry manually."
                    );
                  }
                }

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
      handleCameraChange: async () => {
        const {
          selectedDevice,
          videoProducerRef,
          sendTransportRef,
          updateLocalVideo,
          setVideoProducerRef,
          setIsPrimaryDeviceLoading,
          localVideo,
        } = get();
        if (!selectedDevice) return;
        setIsPrimaryDeviceLoading(true);
        let stream: MediaStream | null = null;
        try {
          // stream = await navigator.mediaDevices.getUserMedia({
          //   video: {
          //     deviceId: { exact: selectedDevice },
          //     width: { ideal: 1280 },
          //     height: { ideal: 720 },
          //     frameRate: { max: 30 },
          //   },
          //   audio: false,
          // });
          // const videoTrack = stream.getVideoTracks()[0];

          // Option 2: Retry with a loop and max attempts
          const maxRetries = 3;
          let attempts = 0;
          let videoTrack: MediaStreamTrack;
          while (attempts < maxRetries) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: selectedDevice },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { max: 30 },
              },
              audio: false,
            });

            videoTrack = stream.getVideoTracks()[0];

            if (videoTrack.readyState === "live") {
              break; // Success!
            }

            // Track ended, clean up and retry
            console.log(
              `Attempt ${attempts + 1}: Video track ended, retrying...`
            );
            stream.getTracks().forEach((track) => track.stop());
            attempts++;

            if (attempts >= maxRetries) {
              throw new Error(
                "Failed to get active video track after multiple attempts"
              );
            }

            // Optional: small delay between retries
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
          if (!sendTransportRef || (sendTransportRef as any)._closed) {
            throw new Error("Send transport not available");
          }

          console.log("Transport state:", sendTransportRef.connectionState);
          console.log(videoTrack, "vid track");

          if (videoProducerRef) {
            await videoProducerRef.replaceTrack({ track: videoTrack });
            // updateLocalVideo(stream);
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

            // ✅ Update local video AFTER successful produce
            // updateLocalVideo(stream);
          }
          updateLocalVideo(stream);
        } catch (error: any) {
          console.error("Error switching webcam:", error);
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
          }
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
        } finally {
          setIsPrimaryDeviceLoading(false);
        }
      },
      toggleSecondaryMode: async (mode: "camera" | "screen") => {
        const {
          secondaryMode: currentMode,
          stopSecondaryCamera,
          stopScreenShare,
          handleSecondaryCamera,
          handleScreenShare,
          selectedSecondaryDevice,
        } = get();

        // If switching to same mode, do nothing
        if (currentMode === mode) return;

        // Stop current secondary stream
        if (currentMode === "camera") {
          await stopSecondaryCamera();
        } else {
          await stopScreenShare();
        }

        // Start new mode
        set({ secondaryMode: mode });

        if (mode === "camera") {
          if (selectedSecondaryDevice) {
            await handleSecondaryCamera(selectedSecondaryDevice);
          }
        } else {
          await handleScreenShare();
        }
      },

      handleScreenShare: async () => {
        const {
          secondarySendTransportRef,
          setScreenShareStream,
          setScreenProducerRef,
          setIsScreenSharing,
          setSecondaryMode,
          screenShareStream: oldScreenStream,
          screenProducerRef: oldScreenProducer,
          sendTransportRef,
          waitForTransportConnection,
          setIsLoadingScreenSharing,
          startScreenAudioProduction,
        } = get();

        const { roomId } = userStoreApi.getState();

        try {
          setIsLoadingScreenSharing(true);
          // Request screen sharing
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: "monitor",
              logicalSurface: true,
              cursor: "always",
              width: { ideal: 1920, max: 1920 },
              height: { ideal: 1080, max: 1080 },
              frameRate: { ideal: 30, max: 30 },
            },
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });

          const videoTrack = stream.getVideoTracks()[0];
          const audioTracks = stream.getAudioTracks();
          if (!videoTrack || videoTrack.readyState !== "live") {
            throw new Error("Screen share track not available");
          }

          // Create secondary transport if it doesn't exist
          let transport = secondarySendTransportRef;
          if (!transport) {
            console.info(
              "Secondary transport doesn't exist, creating for screen share..."
            );
            transport = await createSecondaryTransport();
            if (!transport) {
              throw new Error(
                "Failed to create secondary transport for screen share"
              );
            }
          }

          // Wait for transport to be ready
          await waitForTransportConnection(transport);

          // Produce screen share on SECONDARY transport
          const producer = await transport.produce({
            track: videoTrack,
            encodings: [
              {
                maxBitrate: 1500000,
                maxFramerate: 30,
              },
            ],
            codecOptions: {
              videoGoogleStartBitrate: 1000,
              videoGoogleMinBitrate: 500,
              videoGoogleMaxBitrate: 2000,
            },
            appData: {
              cameraType: "secondary",
              mediaType: "screen",
              source: "screen-share",
            },
          });

          console.log("✅ Screen share producer created:", producer.id);

          if (audioTracks.length > 0) {
            await startScreenAudioProduction(audioTracks[0]);
            toast.success("Screen shared with audio ✅");
          } else {
            toast.warning(
              "Screen shared without audio. Check 'Share audio' next time!"
            );
          }

          // Handle track ended (user stops sharing via browser UI)
          videoTrack.onended = () => {
            console.log("Screen share track ended by user");
            get().stopScreenAudioProduction();
            get().stopScreenShare();
          };

          // Update state
          setScreenProducerRef(producer);
          setScreenShareStream(stream);
          setIsScreenSharing(true);
          setSecondaryMode("screen");

          // Cleanup old resources
          if (oldScreenProducer) {
            try {
              oldScreenProducer.close();
              ws.emit("closeProducer", { producerId: oldScreenProducer.id });
            } catch (e) {
              console.warn("Error closing old screen producer:", e);
            }
          }

          if (oldScreenStream) {
            try {
              oldScreenStream.getTracks().forEach((track) => {
                if (track.readyState === "live") {
                  track.stop();
                }
              });
            } catch (e) {
              console.warn("Error stopping old screen stream:", e);
            }
          }

          toast.success("Screen sharing started");
        } catch (error: any) {
          console.error("❌ Error starting screen share:", error);

          // Handle user cancellation
          if (error.name === "NotAllowedError" || error.name === "AbortError") {
            toast.info("Screen sharing cancelled");
          } else {
            toast.error("Failed to start screen sharing: " + error.message);
          }

          setIsScreenSharing(false);
          setSecondaryMode("camera");
        } finally {
          setIsLoadingScreenSharing(false);
        }
      },

      stopScreenShare: async () => {
        const {
          screenProducerRef,
          screenShareStream,
          setScreenShareStream,
          setScreenProducerRef,
          setIsScreenSharing,
          setSecondaryMode,
          screenAudioProducerRef,
          setScreenAudioProducerRef,
          socket,
        } = get();

        try {
          if (screenProducerRef) {
            screenProducerRef.close();
            setScreenProducerRef(null);
            ws.emit("closeProducer", { producerId: screenProducerRef.id });
          }

          if (screenShareStream) {
            screenShareStream.getTracks().forEach((track) => track.stop());
            setScreenShareStream(undefined);
          }

          if (screenAudioProducerRef) {
            const audioProducerId = screenAudioProducerRef.id;

            // Tell server to close
            if (socket) {
              socket.emit(
                "closeProducer",
                { producerId: audioProducerId },
                (response: any) => {
                  if (response?.error) {
                    console.error(
                      "Failed to close screen audio producer:",
                      response.error
                    );
                  } else {
                    console.log("✅ Server closed screen audio producer");
                  }
                }
              );
            }

            // Close locally
            if (!(screenAudioProducerRef as any)._closed) {
              screenAudioProducerRef.close();
              console.log("✅ Closed screen audio producer locally");
            }

            setScreenAudioProducerRef(null);
          }

          setIsScreenSharing(false);
          setSecondaryMode("camera");

          toast.success("Screen sharing stopped");
        } catch (error) {
          console.error("Error stopping screen share:", error);
          toast.error("Failed to stop screen sharing");
        }
      },
      startScreenAudioProduction: async (audioTrack: MediaStreamTrack) => {
        const {
          sendTransportRef,
          setScreenAudioProducerRef,
          screenAudioProducerRef,
          socket,
        } = get();
        const { userData } = userStoreApi.getState();

        // Close existing screen audio producer if any
        if (
          screenAudioProducerRef &&
          !(screenAudioProducerRef as any)._closed
        ) {
          try {
            screenAudioProducerRef.close();
            if (socket) {
              socket.emit("closeProducer", {
                producerId: screenAudioProducerRef.id,
              });
            }
          } catch (e) {
            console.error("Error closing old screen audio producer:", e);
          }
        }

        if (!sendTransportRef || (sendTransportRef as any)._closed) {
          toast.error("Transport not ready for screen audio");
          return;
        }

        try {
          const screenAudioProducer = await sendTransportRef.produce({
            track: audioTrack,
            appData: {
              mediaType: "audio",
              source: "screenshare",
              userId: userData?.id,
            },
          });

          console.log(
            "✅ Screen audio producer created:",
            screenAudioProducer.id
          );

          setScreenAudioProducerRef(screenAudioProducer);

          // Set up event listeners
          screenAudioProducer.on("transportclose", () => {
            console.log("Screen audio producer transport closed");
            setScreenAudioProducerRef(null);
          });

          screenAudioProducer.on("trackended", () => {
            console.log("Screen audio track ended");
            get().stopScreenAudioProduction();
          });

          toast.success("Screen audio started");
        } catch (error: any) {
          console.error("Error starting screen audio:", error);
          toast.error("Failed to start screen audio: " + error.message);
        }
      },

      // NEW: Stop screen audio production
      stopScreenAudioProduction: () => {
        const {
          screenAudioProducerRef,
          socket,
          setScreenAudioProducerRef,
        } = get();

        if (
          screenAudioProducerRef &&
          !(screenAudioProducerRef as any)._closed
        ) {
          try {
            if (socket) {
              socket.emit("closeProducer", {
                producerId: screenAudioProducerRef.id,
              });
            }
            screenAudioProducerRef.close();
            console.log("Screen audio producer closed");
          } catch (error) {
            console.error("Error closing screen audio producer:", error);
          }
        }

        setScreenAudioProducerRef(null);
        toast.info("Screen audio stopped");
      },
      handleSecondaryCamera: async (deviceId: string) => {
        const {
          secondarySendTransportRef,
          setSecondaryVideo,
          setSecondaryProducerRef,
          setIsSecondaryStreaming,
          setSelectedSecondaryDevice,
          secondaryVideo,
          secondaryProducerRef,
          selectedDevice,
          setIsLoadingSecondaryCamera,
        } = get();

        // Prevent using same device
        if (deviceId === selectedDevice) {
          toast.error("Cannot use same device for both cameras");
          return;
        }

        const oldSecondaryVideo = secondaryVideo;
        const oldSecondaryProducer = secondaryProducerRef;

        let newStream: MediaStream | null = null;
        let newProducer: any = null;
        let transport: Transport<AppData> = secondarySendTransportRef;

        try {
          setIsLoadingSecondaryCamera(true);
          // CRITICAL: Create secondary transport if it doesn't exist
          if (!transport) {
            console.info("Secondary transport doesn't exist, creating...");
            transport = await createSecondaryTransport();

            if (!transport) {
              throw new Error("Failed to create secondary transport");
            }
          }

          // Get the camera stream
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 640 }, // Lower res for secondary
              height: { ideal: 480 },
              frameRate: { max: 15 },
            },
            audio: false,
          });

          const videoTrack = newStream.getVideoTracks()[0];

          console.log("🎥 Secondary camera track state:", {
            readyState: videoTrack.readyState,
            muted: videoTrack.muted,
            enabled: videoTrack.enabled,
            label: videoTrack.label,
          });

          if (videoTrack.readyState === "ended") {
            throw new Error("Video track ended prematurely");
          }

          // Produce on SECONDARY transport
          newProducer = await transport.produce({
            track: videoTrack,
            encodings: [
              {
                maxBitrate: 500000,
                maxFramerate: 15,
              },
            ],
            codecOptions: {
              videoGoogleStartBitrate: 500,
              videoGoogleMinBitrate: 200,
              videoGoogleMaxBitrate: 1000,
            },
            appData: {
              cameraType: "secondary",
              mediaType: "video",
              transportType: "secondary", // Mark which transport this uses
            },
          });

          console.log(
            "✅ Secondary producer created on secondary transport:",
            newProducer.id
          );

          setSecondaryProducerRef(newProducer);
          setSecondaryVideo(newStream);
          setSelectedSecondaryDevice(deviceId);
          setIsSecondaryStreaming(true);

          // Cleanup old resources
          if (oldSecondaryProducer) {
            try {
              oldSecondaryProducer.close();
              ws.emit("closeProducer", { producerId: oldSecondaryProducer.id });
            } catch (e) {
              console.warn("Error closing old producer:", e);
            }
          }

          if (oldSecondaryVideo) {
            try {
              oldSecondaryVideo.getTracks().forEach((track) => {
                if (track.readyState === "live") {
                  track.stop();
                }
              });
            } catch (e) {
              console.warn("Error stopping old tracks:", e);
            }
          }

          toast.success("Webcam started");
        } catch (error: any) {
          console.error("❌ Error starting secondary camera:", error);

          if (newStream) {
            newStream.getTracks().forEach((track) => track.stop());
          }

          if (newProducer) {
            try {
              newProducer.close();
              ws.emit("closeProducer", { producerId: newProducer.id });
            } catch (e) {
              console.warn("Error closing failed producer:", e);
            }
          }

          setIsSecondaryStreaming(false);
          setSelectedSecondaryDevice("");

          if (!oldSecondaryProducer && !oldSecondaryVideo) {
            setSecondaryProducerRef(null);
            setSecondaryVideo(undefined);
          }

          toast.error("Failed to start webcam: " + error.message);
        } finally {
          setIsLoadingSecondaryCamera(false);
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
          secondaryMode,
          stopScreenShare,
        } = get();

        if (secondaryMode === "screen") {
          await stopScreenShare();
          return;
        }

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
      toggleCameraSwap: (userId: string) => {
        const { swappedCameras } = get();
        const newSwapped = new Set(swappedCameras);

        if (newSwapped.has(userId)) {
          newSwapped.delete(userId);
          console.log(`🔄 Unswapped cameras for user ${userId}`);
        } else {
          newSwapped.add(userId);
          console.log(`🔄 Swapped cameras for user ${userId}`);
        }

        set({ swappedCameras: newSwapped });
      },

      isCameraSwapped: (userId: string) => {
        return get().swappedCameras.has(userId);
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
            set({
              sendTransportRef: null,
              videoProducerRef: null,
              secondaryProducerRef: null,
              audioProducerRef: null,
            });
            if (lastRoomName) {
              await createSendTransport(lastRoomName);
              await get().handleCameraChange();
              if (get().selectedSecondaryDevice)
                await get().handleSecondaryCamera(
                  get().selectedSecondaryDevice
                );
              if (get().selectedAudioDevice && !get().isMicMuted)
                await get().handleAudioToggle();
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
      setOldAudioDevice: (deviceId) => set({ oldAudioDevice: deviceId }),
      setStudentMuteStatus: (userId: string, isMuted: boolean) => {
        const { mutedStudents } = get();
        const newMap = new Map(mutedStudents);
        newMap.set(userId, isMuted);
        set({ mutedStudents: newMap });

        console.log(`Student ${userId} mute status: ${isMuted}`);
      },
      startAudioProduction: async () => {
        const {
          selectedAudioDevice,
          oldAudioDevice,
          sendTransportRef,
          setAudioProducerRef,
          setLocalAudio,
          setIsMicMuted,
          audioProducerRef,
          setIsLoadingMic,
          waitForTransportConnection,
          setOldAudioDevice,
          localAudio,
          socket,
          lastUserData,
        } = get();
        const { userData } = userStoreApi.getState();

        // Prevent double creation
        if (
          audioProducerRef &&
          !(audioProducerRef as any)._closed &&
          selectedAudioDevice === oldAudioDevice
        ) {
          localAudio?.getAudioTracks().forEach((t) => (t.enabled = true));
          set({ isMicMuted: false }); // Update UI immediately
          // Phase 2: Server (background)
          socket!.emit("resumeProducer", { producerId: audioProducerRef.id });
          console.log("Audio producer already exists");
          if (socket && userData) {
            socket.emit("muteStatusChanged", {
              userId: userData.id,
              isMuted: false,
            });
          }
          return;
        }

        if (!sendTransportRef || (sendTransportRef as any)._closed) {
          toast.error("Not connected to room");
          return;
        }

        try {
          await waitForTransportConnection(sendTransportRef);
        } catch (transportError: any) {
          console.error("Send transport not ready for audio:", transportError);
          toast.error("Connection error. Cannot start mic.");
          setIsLoadingMic(false);
          return;
        }
        setIsLoadingMic(true);
        try {
          // Get audio stream
          const stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
              deviceId: selectedAudioDevice
                ? { exact: selectedAudioDevice }
                : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000, // Force 48kHz for better quality
              channelCount: 1, // Mono is more stable
            },
          });

          const audioTrack = stream.getAudioTracks()[0];

          audioTrack.onended = () => {
            console.warn("⚠️ Audio track ended (device disconnected?)");
            toast.warning("Microphone disconnected");

            // Clean up
            get().stopAudioProduction();

            // Try to find a new default device
            const { audioDevices, setSelectedAudioDevice } = get();
            if (audioDevices.length > 0) {
              const newDefault = audioDevices[0];
              setSelectedAudioDevice(newDefault.deviceId);
              toast.info(
                `Switched to: ${newDefault.label || "Default Microphone"}`
              );
            }
          };

          console.log("Audio track settings:", audioTrack.getSettings());

          // Produce audio on the SAME transport as video
          const producer = await sendTransportRef.produce({
            track: audioTrack,
            appData: {
              mediaType: "audio",
              source: "microphone",
            },
          });

          console.log("✅ Audio producer created:", producer.id);

          // Set state BEFORE setting up listeners
          setAudioProducerRef(producer);
          setLocalAudio(stream);
          setIsMicMuted(false);
          setOldAudioDevice(selectedAudioDevice);

          if (socket && userData) {
            socket.emit("muteStatusChanged", {
              userId: userData.id,
              isMuted: false,
            });
          }

          // Set up event listeners
          producer.on("transportclose", () => {
            console.log("Audio producer transport closed");
            const { audioProducerRef, localAudio } = get();

            if (audioProducerRef) {
              setAudioProducerRef(null);
            }
            if (localAudio) {
              localAudio.getTracks().forEach((track) => track.stop());
              setLocalAudio(undefined);
            }
            setIsMicMuted(true);
          });

          producer.on("trackended", () => {
            console.log("Audio track ended");
            get().stopAudioProduction();
          });
          setIsLoadingMic(false);
          // toast.success("Microphone enabled");
        } catch (error: any) {
          setIsLoadingMic(false);
          console.error("Error starting audio:", error);

          if (error.name === "NotAllowedError") {
            toast.error("Microphone access denied");
          } else if (error.name === "NotFoundError") {
            toast.error("No microphone found");
          } else if (error.message?.includes("transport")) {
            toast.error("Connection error. Please try rejoining the room.");
          } else {
            toast.error("Failed to start microphone: " + error.message);
          }
          // Cleanup on failure
          // if (stream) {
          //   stream.getTracks().forEach(track => track.stop());
          // }
        }
      },

      stopAudioProduction: () => {
        const { audioProducerRef, localAudio, socket, lastUserData } = get();
        const { userData } = userStoreApi.getState();
        console.log("Stopping audio production");
        if (audioProducerRef && !(audioProducerRef as any)._closed) {
          try {
            // Notify server FIRST
            if (socket) {
              socket.emit("pauseProducer", { producerId: audioProducerRef.id });
            }
            localAudio?.getAudioTracks().forEach((t) => (t.enabled = false));
            set({ isMicMuted: true });

            if (socket && userData) {
              socket.emit("muteStatusChanged", {
                userId: userData.id,
                isMuted: true,
              });
            }
          } catch (error) {
            console.error("Error pausing audio producer:", error);
          }
        }

        // toast.success("Microphone disabled");
      },

      handleAudioToggle: async (userId: string) => {
        const { isMicMuted, audioProducerRef } = get();

        console.log("Audio toggle - Current state:", {
          isMicMuted,
          hasProducer: !!audioProducerRef,
          producerClosed: audioProducerRef
            ? (audioProducerRef as any)._closed
            : null,
        });

        if (
          isMicMuted ||
          !audioProducerRef ||
          (audioProducerRef as any)._closed
        ) {
          await get().startAudioProduction();
        } else {
          get().stopAudioProduction();
        }
      },

      handleAudioDeviceChange: async () => {
        const {
          selectedAudioDevice,
          audioProducerRef,
          isMicMuted,
          stopAudioProduction,
          startAudioProduction,
          socket,
          audioDevices,
        } = get();

        if (!selectedAudioDevice) return;

        const deviceExists = audioDevices.some(
          (d) => d.deviceId === selectedAudioDevice
        );

        if (!deviceExists) {
          console.error("Selected audio device no longer exists");
          toast.error("Selected microphone is no longer available");
          return;
        }

        console.log("Changing audio device to:", selectedAudioDevice);

        if (!isMicMuted && audioProducerRef) {
          await stopAudioProduction();
          set({ selectedAudioDevice: selectedAudioDevice });
          try {
            // Notify server FIRST
            if (socket) {
              socket.emit("closeProducer", { producerId: audioProducerRef.id });
            }

            // Then close locally
            audioProducerRef.close();
          } catch (error) {
            console.error("Error closing audio producer:", error);
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
          await startAudioProduction();
        }
      },

      addRemoteAudioStream: (consumerId: string, stream: MediaStream) => {
        const { remoteAudioStreams, selectedAudioOutputDevice } = get();

        console.log("Adding remote audio stream:", {
          consumerId,
          trackCount: stream.getAudioTracks().length,
          trackSettings: stream.getAudioTracks()[0]?.getSettings(),
        });

        remoteAudioStreams.set(consumerId, stream);
        set({ remoteAudioStreams: new Map(remoteAudioStreams) });

        setTimeout(() => {
          if (
            selectedAudioOutputDevice &&
            "setSinkId" in HTMLAudioElement.prototype
          ) {
            const audioElement = document.querySelector(
              `audio[data-consumer-id="${consumerId}"]`
            ) as HTMLAudioElement;

            if (audioElement && typeof audioElement.setSinkId === "function") {
              audioElement
                .setSinkId(selectedAudioOutputDevice)
                .then(() =>
                  console.log(
                    `✅ Applied audio output to new stream ${consumerId}`
                  )
                )
                .catch((err) =>
                  console.error(`Failed to apply audio output:`, err)
                );
            }
          }
        }, 100);
      },

      removeRemoteAudioStream: (consumerId: string) => {
        const { remoteAudioStreams } = get();

        console.log("Removing remote audio stream:", consumerId);

        const stream = remoteAudioStreams.get(consumerId);
        if (stream) {
          stream.getTracks().forEach((track) => {
            track.stop();
            console.log("Stopped remote audio track:", track.id);
          });
        }
        remoteAudioStreams.delete(consumerId);
        set({ remoteAudioStreams: new Map(remoteAudioStreams) });
      },
      // ⭐ Audio output actions
      setAudioOutputDevices: (devices) => set({ audioOutputDevices: devices }),
      setSelectedAudioOutputDevice: (deviceId) =>
        set({ selectedAudioOutputDevice: deviceId }),
      setOldAudioOutputDevice: (deviceId) =>
        set({ oldAudioOutputDevice: deviceId }),

      handleAudioOutputChange: async () => {
        const { selectedAudioOutputDevice } = get();

        if (!selectedAudioOutputDevice) {
          console.warn("No audio output device selected");
          return;
        }

        console.log("Changing audio output to:", selectedAudioOutputDevice);

        try {
          // Apply to all remote audio streams
          await get().applyAudioOutputToAllElements(selectedAudioOutputDevice);

          // Store as old device
          get().setOldAudioOutputDevice(selectedAudioOutputDevice);

          console.log("✅ Audio output changed successfully");
        } catch (error: any) {
          console.error("Failed to change audio output:", error);
          toast.error("Failed to change speaker: " + error.message);
        }
      },

      applyAudioOutputToAllElements: async (deviceId: string) => {
        const { remoteAudioStreams } = get();

        // Check if browser supports setSinkId
        if (!("setSinkId" in HTMLAudioElement.prototype)) {
          console.warn("Browser doesn't support audio output selection");
          toast.warning("Your browser doesn't support speaker selection");
          return;
        }

        const errors: string[] = [];

        // Apply to all remote audio elements
        for (const [consumerId, stream] of remoteAudioStreams.entries()) {
          try {
            // Find the audio element for this stream
            const audioElement = document.querySelector(
              `audio[data-consumer-id="${consumerId}"]`
            ) as HTMLAudioElement;

            if (audioElement && typeof audioElement.setSinkId === "function") {
              await audioElement.setSinkId(deviceId);
              console.log(`✅ Set audio output for consumer ${consumerId}`);
            } else {
              console.warn(
                `Audio element not found for consumer ${consumerId}`
              );
            }
          } catch (error: any) {
            console.error(
              `Failed to set audio output for consumer ${consumerId}:`,
              error
            );
            errors.push(consumerId);
          }
        }

        if (errors.length > 0) {
          toast.warning(
            `Failed to change speaker for ${errors.length} stream(s)`
          );
        }
      },
      waitForTransportConnection: (
        transport: Transport<AppData>,
        timeoutMs = 10000
      ): Promise<void> => {
        return new Promise((resolve, reject) => {
          const state = transport.connectionState;

          console.log(
            `Waiting for transport connection. Current state: ${state}`
          );

          // Already connected or connecting (connecting is OK, it will connect during produce)
          if (state === "connected") {
            console.log("Transport already connected");
            resolve();
            return;
          }

          // If it's "new", that's actually fine - it will connect when produce() is called
          if (state === "new") {
            console.log("Transport is new, will connect during produce()");
            resolve();
            return;
          }

          // Failed states
          if (state === "failed" || state === "closed") {
            reject(new Error(`Transport in ${state} state`));
            return;
          }

          // If it's "connecting", wait for it to become "connected"
          const timeout = setTimeout(() => {
            transport.off("connectionstatechange", onStateChange);
            reject(new Error("Transport connection timeout"));
          }, timeoutMs);

          const onStateChange = (newState: string) => {
            console.log("Transport state changed to:", newState);

            if (newState === "connected" || newState === "new") {
              clearTimeout(timeout);
              transport.off("connectionstatechange", onStateChange);
              resolve();
            } else if (newState === "failed" || newState === "closed") {
              clearTimeout(timeout);
              transport.off("connectionstatechange", onStateChange);
              reject(new Error(`Transport ${newState}`));
            }
          };

          transport.on("connectionstatechange", onStateChange);
        });
      },
    };
  });
};
