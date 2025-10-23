"use client";

import dynamic from "next/dynamic";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import VideoStream from "@/components/VideoStream";
import NoTokenScreen from "@/components/screen/NoTokenScreen";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";
import { useUserStore } from "@/providers/user-store-provider";
import InvalidRoomScreen from "@/components/screen/InvalidRoomScreen";
import LoadingScreen from "@/components/screen/LoadingScreen";
import StudentView from "@/components/roomView/StudentView";
import TeacherView from "@/components/roomView/TeacherView";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, RefreshCwIcon } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { StudentHeader } from "@/components/layout/StudentHeader";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAllUserVideoInput } from "@/utils/deviceUtils";
import { toast } from "sonner";

function VideoChat() {
  const {
    localVideo,
    remoteStreams,
    isJoining,
    isConnected,
    isRoomJoined,
    videoDevices,
    selectedDevice,
    isDeviceLoading,
    handleJoin,
    handleCameraChange,
    setIsDeviceLoading,
    setVideoDevices,
    setSelectedDevice,
    isReconnecting,
  } = useStreamStore(
    useShallow((state) => ({
      localVideo: state.localVideo,
      remoteStreams: state.remoteStreams,
      isConnected: state.isConnected,
      isRoomJoined: state.isRoomJoined,
      videoDevices: state.videoDevices,
      selectedDevice: state.selectedDevice,
      handleJoin: state.handleJoin,
      handleCameraChange: state.handleCameraChange,
      setSelectedDevice: state.setSelectedDevice,
      isDeviceLoading: state.isDeviceLoading,
      isJoining: state.isJoining,
      setIsDeviceLoading:state.setIsDeviceLoading,
      setVideoDevices:state.setVideoDevices,
      isReconnecting:state.isReconnecting
    }))
  );
  const {
    hasToken,
    hasRoomAccess,
    isUserLoading,
    isRoomLoading,
    roomId,
    userData,
    peerId,
  } = useUserStore(
    useShallow((state) => ({
      hasToken: state.hasToken,
      hasRoomAccess: state.hasRoomAccess,
      isUserLoading: state.isUserLoading,
      isRoomLoading: state.isRoomLoading,
      roomId: state.roomId,
      userData: state.userData,
      peerId: state.peerId,
    }))
  );

  const refreshDevice = async () => {
    // const { setVideoDevices, setIsDeviceLoading } =
    //   storeRef.current!.getState();
    setIsDeviceLoading(true);
    try {
      const devices = await getAllUserVideoInput();
      setVideoDevices(devices);
      toast.success("Device Detected!")
    } catch (err) {
      //@ ALERT HERE
      setVideoDevices([]);
    } finally {
      setIsDeviceLoading(false);
    }
  };

  if (isDeviceLoading || isUserLoading || isRoomLoading)
    return <LoadingScreen />;
  if (!hasToken) return <NoTokenScreen />;
  if (!hasRoomAccess) return <InvalidRoomScreen />;

  if (!isRoomJoined && !isReconnecting) {
    return (
      <div>
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle className="text-2xl">Ready to Join?</CardTitle>
              {userData?.live_role === "Student" && (
                <CardDescription>
                  Configure your video device before entering the room.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {userData?.live_role === "Student" && (
                <div className="flex gap-1">
                  <div className="space-y-2">
                    <label
                      htmlFor="video-device"
                      className="text-sm font-medium"
                    >
                      Camera
                    </label>
                    <div className="flex gap-1">
                      <Select
                        value={selectedDevice}
                        onValueChange={setSelectedDevice}
                      >
                        <SelectTrigger className="w-[280px]" id="video-device">
                          <SelectValue placeholder="Select a video device..." />
                        </SelectTrigger>
                        <SelectContent className="">
                          {videoDevices.map((device) => (
                            <SelectItem
                              key={device?.deviceId}
                              value={device?.deviceId || "h"}
                            >
                              {device?.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={refreshDevice}>
                            <RefreshCwIcon className="text-primary" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Refresh Device</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="default"
                onClick={() => handleJoin(roomId, userData!, peerId, "Student")}
                disabled={
                  !isConnected ||
                  isRoomJoined ||
                  isJoining ||
                  (userData?.live_role === "Student" && !selectedDevice)
                }
                className="bg-primary font-bold py-2 px-4 rounded-lg transition-colors"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading Devices...
                  </>
                ) : (
                  "Join Room"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  if (userData?.live_role === "Student")
    return (
      <div className="flex flex-col min-h-screen max-h-screen">
        <StudentHeader />
        <div className="flex grow justify-center">
          <StudentView stream={localVideo!} />
        </div>
      </div>
    );
  if (userData?.live_role === "Admin" || userData?.live_role === "Teacher")
    return (
      <div className="flex flex-col min-h-screen">
        <AdminHeader />
        <div className="flex grow justify-center">
          <TeacherView streams={remoteStreams} />
        </div>
      </div>
    );
  return <NoTokenScreen />;
}

const DynamicVideoChat = dynamic(() => Promise.resolve(VideoChat), {
  ssr: false,
  loading: () => (
    <p className="text-white text-center text-lg">Loading Video Client...</p>
  ),
});

export default function Home() {
  return <DynamicVideoChat />;
}
