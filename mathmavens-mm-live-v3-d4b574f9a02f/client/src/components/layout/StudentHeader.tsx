// components/layout/header.tsx

"use client";
import { useStreamStore } from "@/providers/stream-store-provider";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/shallow";
import { PhoneCallIcon, PhoneIcon, RefreshCwIcon } from "lucide-react";
import { useUserStore } from "@/providers/user-store-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { getAllUserVideoInput } from "@/utils/deviceUtils";
import { toast } from "sonner";

export function StudentHeader() {
  const router = useRouter();
  const { handleLeaveRoom } = useStreamStore(
    useShallow((state) => ({
      handleLeaveRoom: state.handleLeaveRoom,
    }))
  );
  const {
    videoDevices,
    selectedDevice,

    handleCameraChange,
    setIsDeviceLoading,
    setSelectedDevice,
    setVideoDevices,
  } = useStreamStore(
    useShallow((state) => ({
      videoDevices: state.videoDevices,
      selectedDevice: state.selectedDevice,
      handleCameraChange: state.handleCameraChange,
      setSelectedDevice: state.setSelectedDevice,
      setIsDeviceLoading: state.setIsDeviceLoading,
      setVideoDevices: state.setVideoDevices,
    }))
  );

  const { roomData } = useUserStore(
    useShallow((state) => ({
      roomData: state.roomData,
    }))
  );

  const refreshDevice = async () => {
    // const { setVideoDevices, setIsDeviceLoading } =
    //   storeRef.current!.getState();
    setIsDeviceLoading(true);
    try {
      const devices = await getAllUserVideoInput();
      setVideoDevices(devices);
      toast.success("Device Detected!");
    } catch (err) {
      //@ ALERT HERE
      setVideoDevices([]);
    } finally {
      setIsDeviceLoading(false);
    }
  };
  const handleNavigate = () => {
    router.push(process.env.NEXT_PUBLIC_ELEARNING_PORTAL || "");
  };

  return (
    <header className="px-3 top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className=" flex h-14 items-center">
        {/* Left Side: Logo/Title */}
        <div className="mr-4 flex">
          <p className="mr-6 flex items-center space-x-2">
            {/* <span className="font-bold text-lg">MM LIVE</span> */}
            <span>{roomData.title}</span>
          </p>
        </div>

        <div className="flex flex-1 items-center justify-end space-x-2">
          <div className="flex gap-1">
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
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
          <Button onClick={handleLeaveRoom} size="sm" variant={"destructive"}>
            <PhoneIcon /> Leave Call
          </Button>
          <Button onClick={handleNavigate} size="sm">
            Go to Portal
          </Button>
        </div>
      </div>
    </header>
  );
}
