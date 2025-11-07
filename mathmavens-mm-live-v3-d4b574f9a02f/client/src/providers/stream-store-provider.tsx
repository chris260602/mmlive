"use client";

import {
  type ReactNode,
  createContext,
  useRef,
  useContext,
  useEffect,
} from "react";
import { useStore } from "zustand";
import {
  type StreamStore,
  createStreamStore,
  initStreamStore,
} from "@/stores/stream-store";
import { ws } from "@/ws";
import {
  getAllUserAudioInput,
  getAllUserVideoInput,
  requestCameraPermission,
  requestMediaPermission,
  requestMicrophonePermission,
} from "@/utils/deviceUtils";
import { UserStoreContext } from "./user-store-provider";
import { toast } from "sonner";
import { isLocal, isProd } from "@/utils/envUtils";
import * as Sentry from "@sentry/nextjs";

export type StreamStoreApi = ReturnType<typeof createStreamStore>;

let isRestarting = false;
export const StreamStoreContext = createContext<StreamStoreApi | undefined>(
  undefined
);

export interface StreamStoreProviderProps {
  children: ReactNode;
}

export const StreamStoreProvider = ({ children }: StreamStoreProviderProps) => {
  const userStoreApi = useContext(UserStoreContext);

  // Add a check to ensure the provider is mounted correctly
  if (!userStoreApi) {
    throw new Error(
      "StreamStoreProvider must be used within a UserStoreProvider"
    );
  }
  const storeRef = useRef<StreamStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createStreamStore(initStreamStore(), userStoreApi);
  }

  const initApp = async () => {
    const {
      setVideoDevices,
      setIsDeviceLoading,
      setAudioDevices,
      setSelectedAudioDevice,
    } = storeRef.current!.getState();
    setIsDeviceLoading(true);
    try {
      const mediaGranted = await requestMediaPermission();
      // const cameraGranted = await requestCameraPermission();
      // const micGranted = await requestMicrophonePermission();
      if (!mediaGranted) {
        console.warn("⚠️ Media permission not granted");
      }
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        console.table(
          devices.map((d) => ({
            label: d.label,
            kind: d.kind,
            deviceId: d.deviceId,
          }))
        );
      });
      // if (!cameraGranted) {
      //   console.warn("⚠️ Camera permission not granted");
      //   setVideoDevices([]);
      // }

      // if (!micGranted) {
      //   console.warn("⚠️ Microphone permission not granted");
      //   setAudioDevices([]);
      // }
      // const vids = await getAllUserVideoInput();
      // const soundss = await getAllUserAudioInput();
      // setVideoDevices(vids);
      // setAudioDevices(soundss);
      // ✅ Only get devices if permissions granted
      // if (cameraGranted || micGranted) {
      const [videoDevices, audioDevices] = await Promise.all([
        getAllUserVideoInput(),
        getAllUserAudioInput(),
      ]);

      setVideoDevices(videoDevices);
      setAudioDevices(audioDevices);
      if (audioDevices.length > 0)
        setSelectedAudioDevice(audioDevices[0].deviceId);
      // }
    } catch (err) {
      toast.error("No Device Found");
      setVideoDevices([]);
      setAudioDevices([]);
    } finally {
      setIsDeviceLoading(false);
    }
  };

  useEffect(() => {
    const {
      localVideo,
      removeRemoteStream,
      setSocket,
      setIsConnected,
      consume,
      setupSocketEventHandlers,
      startHeartbeat,
      stopHeartbeat,
      setConnectionQuality,
      updateConnectionStatus,
    } = storeRef.current!.getState();
    setSocket(ws);
    setupSocketEventHandlers();
    initApp();
    ws.on("connect", async () => {
      console.log("Connected to signaling server with ID:", ws.id);
      setIsConnected(true);
      updateConnectionStatus();
      startHeartbeat();
    });

    ws.on("disconnect", () => {
      console.log("Disconnected from signaling server");
      setIsConnected(false);
      updateConnectionStatus();
      stopHeartbeat();
    });

    ws.on("connect_error", (error) => {
      console.error("Connection error:", error);
      if (!isLocal())
        Sentry.captureException(error, {
          tags: {
            operation: "websocket_connect",
            errorType: "connect_error",
          },
          level: "error",
        });
      updateConnectionStatus();
    });

    // Handle reconnection events
    ws.on("reconnect", (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
      updateConnectionStatus();
    });

    ws.on("reconnecting", (attemptNumber) => {
      console.log(`Reconnecting... attempt ${attemptNumber}`);
      updateConnectionStatus();
    });

    ws.on("reconnect_error", (error) => {
      console.error("Reconnection error:", error);
      updateConnectionStatus();
    });

    ws.on("reconnect_failed", () => {
      console.error("Failed to reconnect after all attempts");
      updateConnectionStatus();
    });

    // When a new remote stream is avaiable
    ws.on("new-producer", async ({ producerId, userData, kind }) => {
      console.log(`A new producer is available: ${producerId} (${kind})`);
      try {
        const {
          addAvailableProducer,
          consume,
          availableProducers,
          isProducerBeingConsumed,
          pendingConsumers,
        } = storeRef.current!.getState();

        if (availableProducers.has(producerId)) {
          console.log(`Producer ${producerId} already known, skipping`);
          return;
        }

        // Check if already consuming
        if (
          isProducerBeingConsumed(producerId) ||
          pendingConsumers.has(producerId)
        ) {
          console.log(
            `Producer ${producerId} already being consumed, skipping`
          );
          return;
        }

        // Track the new producer
        addAvailableProducer(producerId, userData, kind || "video");

        try {
          // This await is still important for handling the result and errors
          // for this specific consume call.
          await new Promise((resolve) => setTimeout(resolve, 500));

          await consume(producerId);
          console.log("Consumption successful!");
        } catch (error) {
          console.error("Failed to consume:", error);
        }
      } catch (error) {
        console.error("Failed to consume new producer:", error);
      }
    });

    // When one or more remote stream is leaving
    ws.on("consumer-closed", ({ consumerId }) => {
      console.log(`A consumer has been closed: ${consumerId}`);
      const { removeRemoteStream, removeActiveConsumer } =
        storeRef.current!.getState();
      removeRemoteStream(consumerId);
      removeActiveConsumer(consumerId);
    });

    // Handle producer closed (when someone stops sharing)
    ws.on("producer-closed", ({ producerId }) => {
      console.log(`A producer has been closed: ${producerId}`);
      const {
        removeAvailableProducer,
        remoteStreams,
        removeRemoteStream,
        activeConsumers,
      } = storeRef.current!.getState();

      // Remove from available producers
      removeAvailableProducer(producerId);

      // Find and remove ALL associated consumers for this producer
      const consumersToRemove = Array.from(activeConsumers.entries())
        .filter(([_, consumer]) => consumer.producerId === producerId)
        .map(([consumerId]) => consumerId);

      console.log(
        `Removing ${consumersToRemove.length} consumers for producer ${producerId}`
      );

      consumersToRemove.forEach((consumerId) => {
        removeRemoteStream(consumerId);
        storeRef.current!.getState().removeActiveConsumer(consumerId);
      });
    });

    ws.on("peer-left", ({ peerId }) => {
      console.log(`Peer left: ${peerId}`);
      // Remove streams from this peer
      const { remoteStreams, setRemoteStreams } = storeRef.current!.getState();
      const updatedStreams = remoteStreams.filter(
        (stream) => stream.userData?.peerId !== peerId
      );
      setRemoteStreams(updatedStreams);
    });

    ws.on("refresh-student-client", ({ peerId, userId }) => {
      const { selectedDevice: currDevice, selectedSecondaryDevice } =
        storeRef.current!.getState();
      const {
        roomId,
        userData,
        peerId: currentPeerId,
      } = userStoreApi.getState();

      if (peerId === currentPeerId && userData!.id === userId) {
        const dataToStore = {
          is_restart: true,
          media: currDevice,
          secondMedia: selectedSecondaryDevice,
          room: roomId,
          userData: userData,
          peerId: peerId,
        };

        // 2. Stringify the entire object and save it.
        sessionStorage.setItem("student_restart", JSON.stringify(dataToStore));
        window.location.reload();
      }
    });

    ws.on("kick-student-client", ({ peerId, userId }) => {
      const { userData, peerId: currentPeerId } = userStoreApi.getState();

      if (peerId === currentPeerId && userData!.id === userId) {
        const { handleLeaveRoom } = storeRef.current!.getState();
        toast.error("Kicked from the room");
        handleLeaveRoom();
      }
    });

    ws.on("heartbeat", (data) => {
      ws.emit("heartbeat-response", {
        timestamp: Date.now(),
        receivedAt: data.timestamp,
      });
    });

    // Enhanced transport monitoring events
    ws.on("transport-ice-connected", ({ transportId }) => {
      console.log(`Transport ${transportId} ICE connected`);
      const { setConnectionQuality } = storeRef.current!.getState();
      updateConnectionStatus();
    });

    ws.on("transport-ice-disconnected", ({ transportId }) => {
      console.warn(`Transport ${transportId} ICE disconnected`);
      const { setConnectionQuality } = storeRef.current!.getState();
      updateConnectionStatus();
    });

    ws.on("transport-ice-failed", ({ transportId }) => {
      console.error(`Transport ${transportId} ICE failed`);
      const { setConnectionQuality, handleTransportFailure } =
        storeRef.current!.getState();
      updateConnectionStatus();

      // Determine transport type and trigger recovery
      const { sendTransportRef, recvTransportRef } =
        storeRef.current!.getState();
      if (sendTransportRef?.id === transportId) {
        handleTransportFailure("send");
      } else if (recvTransportRef?.id === transportId) {
        handleTransportFailure("receive");
      }
    });

    ws.on("transport-closed", ({ transportId, reason }) => {
      console.log(
        `Server notified: transport ${transportId} closed (${reason})`
      );

      const { sendTransportRef, recvTransportRef } =
        storeRef.current!.getState();

      // Identify which transport was closed and trigger recovery
      if (sendTransportRef?.id === transportId) {
        console.log("Send transport was closed by server");
        storeRef.current!.getState().handleTransportFailure("send");
      } else if (recvTransportRef?.id === transportId) {
        console.log("Receive transport was closed by server");
        storeRef.current!.getState().handleTransportFailure("receive");
      }
    });

    ws.on("transport-dtls-failed", ({ transportId }) => {
      console.error(`Transport ${transportId} DTLS failed`);
      const { setConnectionQuality, handleTransportFailure } =
        storeRef.current!.getState();
      updateConnectionStatus();

      // Trigger recovery based on transport type
      const { sendTransportRef, recvTransportRef } =
        storeRef.current!.getState();
      if (sendTransportRef?.id === transportId) {
        handleTransportFailure("send");
      } else if (recvTransportRef?.id === transportId) {
        handleTransportFailure("receive");
      }
    });

    ws.on(
      "transport-quality-update",
      ({ transportId, rtt, packetLossRate, quality }) => {
        console.log(
          `Transport ${transportId} quality: ${quality} (RTT: ${rtt}ms, Loss: ${packetLossRate}%)`
        );
        const { setConnectionQuality } = storeRef.current!.getState();
        setConnectionQuality(quality);

        // You could also show this info in your UI
        if (quality === "poor") {
          console.warn("Poor connection quality detected");
        }
      }
    );

    // ws.on("studentSpeaking", ({ socketId, isSpeaking }) => {
    //   console.log(`Student ${socketId} speaking: ${isSpeaking}`);

    //   // ✅ Find the consumerId for this socketId
    //   const { remoteAudioStreams, activeConsumers } =
    //     storeRef.current!.getState();

    //   // Find consumer that belongs to this producer
    //   const consumerEntry = Array.from(activeConsumers.entries()).find(
    //     ([consumerId, consumer]) => {
    //       // Check if this consumer is consuming from this socket's producer
    //       // You need to track producer's socketId in consumer metadata
    //       return consumerId === socketId; // or however you stored it
    //     }
    //   );

    //   if (consumerEntry) {
    //     const [consumerId] = consumerEntry;
    //     storeRef
    //       .current!.getState()
    //       .setSpeakingConsumer(consumerId, isSpeaking);
    //   }
    // });

    ws.on(
      "studentMuteStatusChanged",
      ({ userId, isMuted }: { userId: string; isMuted: boolean }) => {
        console.log(
          `Student ${userId} mute status changed: ${
            isMuted ? "muted" : "unmuted"
          }`
        );
        storeRef.current!.getState().setStudentMuteStatus(userId, isMuted);
      }
    );

    const monitorConnection = () => {
      const interval = setInterval(() => {
        const { isConnected } = storeRef.current!.getState();
        if (!ws.connected && isConnected) {
          setIsConnected(false);
          updateConnectionStatus();
        } else if (ws.connected && !isConnected) {
          setIsConnected(true);
          updateConnectionStatus();
        } else if (!ws.connected || !isConnected) {
          updateConnectionStatus();
        }
      }, 1000);

      return () => clearInterval(interval);
    };

    const cleanupMonitoring = monitorConnection();

    return () => {
      cleanupMonitoring();
      ws.off("connect");
      ws.off("disconnect");
      ws.off("connect_error");
      ws.off("reconnect");
      ws.off("reconnecting");
      ws.off("reconnect_error");
      ws.off("reconnect_failed");
      ws.off("new-producer");
      ws.off("consumer-closed");
      ws.off("producer-closed");
      ws.off("peer-left");
      ws.off("refresh-student-client");
      ws.off("heartbeat");
      ws.off("transport-ice-connected");
      ws.off("transport-ice-disconnected");
      ws.off("transport-ice-failed");
      ws.off("transport-dtls-failed");
      ws.off("transport-quality-update");
      ws.off("studentSpeaking");
      ws.off("studentMuteStatusChanged");
      //   if (ws) ws.disconnect();
      // Also clean up local media stream
      if (localVideo) {
        localVideo.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // This effect handles switching the camera when the selected device changes
  useEffect(() => {
    const unsubscribe = storeRef.current!.subscribe(
      // The callback runs on every state change
      (state, prevState) => {
        // We only care if the selectedDevice has actually changed
        if (state.selectedDevice !== prevState.selectedDevice) {
          console.log("Selected device changed:", state.selectedDevice);

          // Your existing logic
          if (
            state.isRoomJoined &&
            state.selectedDevice &&
            state.sendTransportRef
          ) {
            state.handleCameraChange();
          }
        }
      }
    );
    // We only want to switch if the room is already joined and a device is selected.

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Prevent this effect from running again if it's already in progress
    if (isRestarting) return;

    const { setSelectedDevice, handleJoin, setSelectedSecondaryDevice } =
      storeRef.current!.getState();
    const restartRaw = sessionStorage.getItem("student_restart");

    if (restartRaw) {
      // 1. Immediately remove the item to prevent the next run from finding it
      sessionStorage.removeItem("student_restart");

      try {
        const restartConfig = JSON.parse(restartRaw);
        console.log("Restart configuration found:", restartConfig);

        if (restartConfig.is_restart) {
          // 2. Set the flag to true
          isRestarting = true;

          const runRestart = async () => {
            if (restartConfig.media) {
              setSelectedDevice(restartConfig.media);
              setSelectedSecondaryDevice(restartConfig.secondMedia);
              console.log(restartConfig.secondMedia, "secme");
              await handleJoin(
                restartConfig.room,
                restartConfig.userData,
                restartConfig.peerId,
                "Student"
              );
            }
          };

          runRestart();
        }
      } catch (error) {
        console.error("Failed to parse restart configuration:", error);
        // The item is already removed, so no need to remove it again here.
      }
    }
  }, []); // Empty dependency array is correct

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log("Tab became hidden");
        // Optionally pause non-essential operations
      } else {
        console.log("Tab became visible");
        const { isConnected, socket, connectionQuality } =
          storeRef.current!.getState();

        // Check connection status when tab becomes visible
        if (!isConnected && socket) {
          console.log(
            "Tab visible but not connected, attempting reconnection..."
          );
          storeRef.current!.getState().attemptReconnection();
        }

        // Send heartbeat immediately on visibility
        if (isConnected && socket) {
          socket.emit("heartbeat-response", {
            timestamp: Date.now(),
            quality: connectionQuality,
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log("Connecting to network");
      if (!isProd()) toast.success("Connecting to network");
      const { attemptReconnection } = storeRef.current!.getState();
      attemptReconnection();
    };

    const handleOffline = () => {
      console.log("Network connection lost");
      toast.error("Network connection lost");
      const { updateConnectionStatus } = storeRef.current!.getState();
      updateConnectionStatus();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = storeRef.current!.subscribe((state, prevState) => {
      // When room is joined and we have streams, apply the current view mode
      if (
        !prevState.isRoomJoined &&
        state.isRoomJoined &&
        state.remoteStreams.length > 0
      ) {
        console.log(
          "Room joined with streams, applying view mode:",
          state.cameraViewMode
        );
        state.manageConsumersForViewMode(state.cameraViewMode);
      }

      // Also apply when new streams arrive
      if (
        state.isRoomJoined &&
        state.remoteStreams.length > prevState.remoteStreams.length
      ) {
        console.log("New streams detected, reapplying view mode");
        state.manageConsumersForViewMode(state.cameraViewMode);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // if (process.env.NODE_ENV === "development") {
    console.log("Attaching stream store to window.testApi for testing.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).testApi = storeRef.current;
    // }
  }, []);

  return (
    <StreamStoreContext.Provider value={storeRef.current}>
      {children}
    </StreamStoreContext.Provider>
  );
};

export const useStreamStore = <T,>(selector: (store: StreamStore) => T): T => {
  const streamStoreContext = useContext(StreamStoreContext);

  if (!streamStoreContext) {
    throw new Error(`useStreamStore must be used within StreamStoreProvider`);
  }

  return useStore(streamStoreContext, selector);
};
