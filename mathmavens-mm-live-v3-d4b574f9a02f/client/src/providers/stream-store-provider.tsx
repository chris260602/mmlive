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
  getAllUserVideoInput,
} from "@/utils/deviceUtils";
import { useUserStore } from "./user-store-provider";
import { useShallow } from "zustand/shallow";

export type StreamStoreApi = ReturnType<typeof createStreamStore>;

export const StreamStoreContext = createContext<StreamStoreApi | undefined>(
  undefined
);

export interface StreamStoreProviderProps {
  children: ReactNode;
}

export const StreamStoreProvider = ({ children }: StreamStoreProviderProps) => {
  const {
    roomId,userData
  } = useUserStore(
    useShallow((state) => ({
      roomId:state.roomId,
      userData:state.userData
    }))
  );
  const storeRef = useRef<StreamStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createStreamStore(initStreamStore());
  }

  const initApp = async () => {
    const { setVideoDevices,setIsDeviceLoading } = storeRef.current!.getState();
    setIsDeviceLoading(true);
    try{
      const devices = await getAllUserVideoInput();
      setVideoDevices(devices);
    }catch(err){
      //@ ALERT HERE
      setVideoDevices([]);
    }finally{
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
      handleJoin
    } = storeRef.current!.getState();
    setSocket(ws);
    initApp();
    ws.on("connect", async() => {
      console.log("Connected to signaling server with ID:", ws.id);
      setIsConnected(true);
      
    });

    ws.on("disconnect", () => {
      console.log("Disconnected from signaling server");
      setIsConnected(false);
    });

    // When a new remote stream is avaiable
    ws.on("new-producer", async ({ producerId }) => {
      console.log(`A new producer is available: ${producerId}`);
      await consume(producerId);
      // if(userData && userData.live_role !== 'Student')await consume(producerId);
    });

    // When one or more remote stream is leaving
    ws.on("consumer-closed", ({ consumerId }) => {
      console.log(`A consumer has been closed: ${consumerId}`);
      removeRemoteStream(consumerId);
      // setRemoteStreams(prevStreams =>
      //     prevStreams.filter(s => s.consumerId !== consumerId)
      // );
    });

    return () => {
      ws.off("connect");
      ws.off("disconnect");
      ws.off("new-producer");
      ws.off("consumer-closed");
      //   if (ws) ws.disconnect();
      // Also clean up local media stream
      if (localVideo) {
        localVideo.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // NEW: This effect handles switching the camera when the selected device changes
  useEffect(() => {
    const unsubscribe = storeRef.current!.subscribe(
      // The callback runs on every state change
      (state, prevState) => {
        // We only care if the selectedDevice has actually changed
        if (state.selectedDevice !== prevState.selectedDevice) {
          console.log("Selected device changed:", state.selectedDevice);

          // Your existing logic
          if (state.isRoomJoined && state.selectedDevice && state.sendTransportRef) {
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
    if (process.env.NODE_ENV === 'development') {
      console.log("Attaching stream store to window.testApi for testing.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).testApi = storeRef.current;
    }
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
