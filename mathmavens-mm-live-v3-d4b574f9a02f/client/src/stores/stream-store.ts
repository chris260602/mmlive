import { REMOTE_STREAM_TYPE } from "@/utils/deviceUtils";
import { AppData, Producer, Transport } from "mediasoup-client/types";
import { Socket } from "socket.io-client";
import { createStore } from "zustand/vanilla";
import * as mediasoupClient from "mediasoup-client";
import { toast } from "sonner";
import { useUserStore } from "@/providers/user-store-provider";
import { useShallow } from "zustand/shallow";
export type StreamState = {
  localVideo?: MediaStream;
  isJoining:boolean;
  isConnected: boolean;
  isDeviceLoading: boolean;
  isRoomJoined: boolean;
  selectedDevice: string;
  socket: Socket | null; // To hold the WebSocket instance
  videoRef: HTMLVideoElement | null; // To hold a ref to a <video> element
  remoteStreams: REMOTE_STREAM_TYPE[];
  sendTransportRef: Transport<AppData> | null;
  recvTransportRef: Transport<AppData> | null;
  videoProducerRef: Producer<AppData> | null;
  deviceRef?: mediasoupClient.types.Device;
  videoDevices: REMOTE_STREAM_TYPE[];
};

export type StreamActions = {
  setSocket: (socket: Socket | null) => void;
  setVideoRef: (ref: HTMLVideoElement | null) => void;
  setIsJoining: (status: boolean) => void;
  setIsConnected: (status: boolean) => void;
  setIsDeviceLoading: (status: boolean) => void;
  setIsRoomJoined: (status: boolean) => void;
  setLocalVideo: (stream: MediaStream) => void;
  setRemoteStreams: (streams: REMOTE_STREAM_TYPE[]) => void;
  removeRemoteStream: (consumerId: string) => void;
  setDeviceRef: (device: mediasoupClient.types.Device) => void;
  setVideoProducerRef: (ref: Producer<AppData>) => void;
  setSendTransportRef: (ref: Transport<AppData>) => void;
  setRecvTransportRef: (ref: Transport<AppData>) => void;
  updateLocalVideo: (newStream: MediaStream) => void;
  addRemoteStream: (remoteStream: REMOTE_STREAM_TYPE) => void;
  setVideoDevices: (devices: REMOTE_STREAM_TYPE[]) => void;
  setSelectedDevice: (device: string) => void;

  handleJoin: (roomName: string,userData:object,live_role:string) => Promise<void>;
  handleCameraChange: () => Promise<void>;
  consume: (producerId: string) => Promise<void>;
};

export type StreamStore = StreamState & StreamActions;

export const initStreamStore = (): StreamState => {
  return {
    isJoining:false,
    isConnected: true,
    isDeviceLoading: true,
    isRoomJoined: false,
    selectedDevice: "",
    socket: null,
    videoRef: null,
    remoteStreams: [],
    sendTransportRef: null,
    recvTransportRef: null,
    videoProducerRef: null,
    videoDevices: [],
  };
};

export const defaultInitState: StreamState = {
  isJoining:false,
  isConnected: true,
  isDeviceLoading: true,
  isRoomJoined: false,
  selectedDevice: "",
  socket: null,
  videoRef: null,
  remoteStreams: [],
  sendTransportRef: null,
  recvTransportRef: null,
  videoProducerRef: null,
  videoDevices: [],
};

export const createStreamStore = (
  initState: StreamState = defaultInitState
) => {
  return createStore<StreamStore>()((set, get) => {
    const createSendTransport = (roomName: string): Promise<void> => {
      const { socket, deviceRef } = get();
      return new Promise((resolve, reject) => {
        socket!.emit(
          "createWebRtcTransport",
          { isSender: true },
          ({ params }) => {
            if (params.error) {
              console.error(params.error);
              return reject(new Error(params.error));
            }
            const transport = deviceRef!.createSendTransport(params);
            set({ sendTransportRef: transport });
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
              async ({ kind, rtpParameters }, callback, errback) => {
                try {
                  socket!.emit(
                    "produce",
                    {
                      transportId: transport.id,
                      kind,
                      rtpParameters,
                      roomName,
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
          }
        );
      });
    };

    const createRecvTransport = (): Promise<void> => {
      const { socket, deviceRef } = get();
      return new Promise((resolve, reject) => {
        socket!.emit(
          "createWebRtcTransport",
          { isSender: false },
          ({ params }) => {
            if (params.error) {
              console.error(params.error);
              return reject(new Error(params.error));
            }
            const transport = deviceRef!.createRecvTransport(params);
            set({ recvTransportRef: transport });
            transport.on("connect", ({ dtlsParameters }, callback, errback) => {
              socket!.emit(
                "connectTransport",
                { transportId: transport.id, dtlsParameters },
                (data) => {
                  if (data.error) errback(new Error(data.error));
                  else callback();
                }
              );
            });
            resolve();
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
      setRemoteStreams: (streams) => set({ remoteStreams: streams }),
      setDeviceRef: (device) => set({ deviceRef: device }),
      setVideoProducerRef: (ref) => set({ videoProducerRef: ref }),
      setSendTransportRef: (ref) => set({ sendTransportRef: ref }),
      setRecvTransportRef: (ref) => set({ recvTransportRef: ref }),
      setVideoDevices: (devices) => set({ videoDevices: devices }),
      setSelectedDevice: (device) => set({ selectedDevice: device }),
      consume: async (producerId: string) => {
        const { socket, recvTransportRef, deviceRef, addRemoteStream } = get();
        if (!recvTransportRef) return;
        const { rtpCapabilities } = deviceRef!;
        socket!.emit(
          "consume",
          { transportId: recvTransportRef.id, producerId, rtpCapabilities },
          async ({ params }) => {
            if (params.error)
              return console.error("Cannot consume", params.error);
            const consumer = await recvTransportRef.consume(params);
            const { track } = consumer;
            const newStream = new MediaStream([track]);
            console.log(params,"consumer");
            // console.log(newStream)
            addRemoteStream({
              stream: newStream,
              consumerId: consumer.id,
              userData:params.userData
            } as REMOTE_STREAM_TYPE);
            socket!.emit("resume", { consumerId: consumer.id });
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
        set({
          remoteStreams: [...get().remoteStreams, newStream],
        });
      },

      handleJoin: async (roomName: string,userData:object, live_role: string) => {
        const { socket, consume, handleCameraChange,setIsJoining } = get();
        if (!socket) return toast.error("Socket not connected!");
        setIsJoining(true);
        socket.emit("joinRoom", {roomName,userData}, async (data: any) => {
          if (data.error) {
            toast.error("Failed to join room: " + data.error);
            setIsJoining(false);
            return;
          }
          try {
            const device = new mediasoupClient.Device();
            get().setDeviceRef(device);
            await device.load({ routerRtpCapabilities: data.rtpCapabilities });
            if (live_role !== "Admin") await createSendTransport(roomName);
            await createRecvTransport();

            // if(live_role !== 'Student'){

            if (data.existingProducerIds) {
              for (const producerId of data.existingProducerIds) {
                await consume(producerId);
              }
            }
            // }
            await handleCameraChange();
            get().setIsRoomJoined(true);
            setIsJoining(false);
            toast.success("Room joined!");

            // alert("Room joined!");
          } catch (error) {
            console.error(error);
            toast.error("Failed to join room.");
            setIsJoining(false);
          }
        });
      },

      handleCameraChange: async () => {
        const {
          isRoomJoined,
          selectedDevice,
          videoProducerRef,
          sendTransportRef,
          updateLocalVideo,
          setVideoProducerRef,
        } = get();
        // if (!isRoomJoined || !selectedDevice) {

        //   return;
        // }
        if (!selectedDevice) return;

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: selectedDevice },
              width: { exact: 1400 },
              height: { exact: 800 },
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
                { rid: "r0", maxBitrate: 100000 },
                { rid: "r1", maxBitrate: 300000 },
                { rid: "r2", maxBitrate: 900000 },
              ],
            });
            setVideoProducerRef(newProducer);
          }
          updateLocalVideo(stream);
        } catch (error) {
          console.error("Error switching webcam:", error);
        }
      },
    };
  });
};
