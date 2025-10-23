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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

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
    setSelectedDevice,
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
      isJoining:state.isJoining
    }))
  );
  const {
    hasToken,
    hasRoomAccess,
    isUserLoading,
    isRoomLoading,
    roomId,
    userData,
  } = useUserStore(
    useShallow((state) => ({
      hasToken: state.hasToken,
      hasRoomAccess: state.hasRoomAccess,
      isUserLoading: state.isUserLoading,
      isRoomLoading: state.isRoomLoading,
      roomId: state.roomId,
      userData: state.userData,
    }))
  );

  if (isDeviceLoading || isUserLoading || isRoomLoading)
    return <LoadingScreen />;
  if (!hasToken) return <NoTokenScreen />;
  if (!hasRoomAccess) return <InvalidRoomScreen />;
  // if (userData?.live_role === "Admin" && !isRoomJoined) {
  //   return (
  //     <Button
  //       onClick={() => handleJoin(roomId, userData, "Admin")}
  //       disabled={!isConnected || isRoomJoined}
  //       className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
  //     >
  //       1. Join Room
  //     </Button>
  //   );
  // } else 
  if (
   
    !isRoomJoined
  ) {
    return (
      <div>
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Ready to Join?</CardTitle>
          {userData?.live_role !== "Admin" && <CardDescription>
            Configure your video device before entering the room.
          </CardDescription>}
          
        </CardHeader>
        <CardContent className="space-y-6">
      

          {/* {error && (
            <Alert variant="destructive">
               <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )} */}
{userData?.live_role !== "Admin" && <div className="space-y-2">
            <label htmlFor="video-device" className="text-sm font-medium">
              Camera
            </label>
            <Select
          value={selectedDevice}
          onValueChange={setSelectedDevice}
          // disabled={!isRoomJoined}
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
            
          </div>}
          
        </CardContent>
        <CardFooter>
        <Button
          variant="default"
          onClick={() => handleJoin(roomId, userData, "Student")}
          disabled={!isConnected || isRoomJoined || isJoining || (userData?.live_role === "Student" && !selectedDevice)}
          className="bg-primary font-bold py-2 px-4 rounded-lg transition-colors"
        >
          {/* Join Room */}
          {isJoining ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Devices...
              </>
            ) : (
              "Join Room"
            )}
        </Button>
          {/* <Button
            className="w-full"
            onClick={handleJoinClick}
            disabled={!selectedDeviceId || isLoading || error}
          >
            
          </Button> */}
        </CardFooter>
      </Card>
    </div>
        
        
      </div>
    );
  }
  if (userData?.live_role === "Student")
    return <StudentView stream={localVideo} />;
  if (userData?.live_role === "Admin" || userData?.live_role === "Teacher")
    return (
      <div className="flex flex-col min-h-screen">
        <div className="flex grow justify-center">
          <TeacherView streams={remoteStreams} />
        </div>
      </div>
    );

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center p-4 font-sans">
      <h1 className="text-4xl font-bold mb-4">
        Video Chat {roomId} {userData?.live_role}
      </h1>
     

      <div className="w-full max-w-6xl p-4 bg-gray-800 rounded-lg shadow-lg">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <button
            onClick={() => handleJoin(roomId, "")}
            disabled={!isConnected || isRoomJoined}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            1. Join Room
          </button>
          <Select
            value={selectedDevice}
            onValueChange={setSelectedDevice}
            disabled={!isRoomJoined}
          >
            <SelectTrigger className="w-[280px] bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="Select a camera" />
            </SelectTrigger>
            <SelectContent className="bg-gray-700 text-white">
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
        </div>

        {/* ... The rest of your JSX remains the same ... */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* <div className="bg-gray-700 p-3 rounded-lg">
            <h2 className="text-xl mb-2">My Video</h2>
            <div className="aspect-video bg-black rounded-md overflow-hidden">
              {localVideo && (
                <VideoStream consumerId="user" stream={localVideo} />
              )}
            </div>
          </div> */}
          {userData?.live_role !== "Admin" && (
            <div className="bg-gray-700 p-3 rounded-lg">
              <h2 className="text-xl mb-2">My Video</h2>
              <div className="aspect-video bg-black rounded-md overflow-hidden">
                {localVideo && (
                  <VideoStream consumerId="user" stream={localVideo} />
                )}
              </div>
            </div>
          )}

          <div className="bg-gray-700 p-3 rounded-lg">
            <h2 className="text-xl mb-2">
              Remote Videos ({remoteStreams.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {remoteStreams.map(({ stream, consumerId }) => (
                <VideoStream
                  key={consumerId}
                  stream={stream}
                  consumerId={consumerId}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Status:{" "}
        {isConnected ? (
          <span className="text-green-400">Connected</span>
        ) : (
          <span className="text-red-400">Disconnected</span>
        )}
      </div>
    </div>
  );
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
