// components/layout/header.tsx

"use client";
import { useStreamStore } from "@/providers/stream-store-provider";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/shallow";
import { CameraIcon, CameraOffIcon, Loader2, PhoneIcon, RefreshCwIcon } from "lucide-react";
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
import { AudioControls } from "../AudioControls";

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
secondaryProducerRef, // Is secondary stream active?
    selectedSecondaryDevice, // Secondary device ID
    isSecondaryStreaming,
    isLoadingSecondaryCamera,
    handleSecondaryCamera,
    stopSecondaryCamera,
    setSelectedSecondaryDevice,

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
      secondaryProducerRef: state.secondaryProducerRef,
      selectedSecondaryDevice: state.selectedSecondaryDevice,
      isSecondaryStreaming: state.isSecondaryStreaming,
      handleSecondaryCamera: state.handleSecondaryCamera,
      stopSecondaryCamera: state.stopSecondaryCamera,
      setSelectedSecondaryDevice: state.setSelectedSecondaryDevice,
      isLoadingSecondaryCamera:state.isLoadingSecondaryCamera
    }))
  );

  const { roomData } = useUserStore(
    useShallow((state) => ({
      roomData: state.roomData,
    }))
  );

  const availableSecondaryDevices = videoDevices.filter(
    (device) => device.deviceId !== selectedDevice
  );

  const handleSecondaryDeviceChange = (deviceId: string) => {
    setSelectedSecondaryDevice(deviceId);
    toggleSecondaryStream()
  };

  const toggleSecondaryStream = () => {
    if (secondaryProducerRef) {
      stopSecondaryCamera();
    } else if (selectedSecondaryDevice) {
        handleSecondaryCamera(selectedSecondaryDevice);
    } else if (availableSecondaryDevices.length > 0){
        // If no secondary device is selected yet, but devices are available,
        // select the first available one and start it.
        const firstAvailable = availableSecondaryDevices[0].deviceId;
        setSelectedSecondaryDevice(firstAvailable);
        handleSecondaryCamera(firstAvailable);
    } else {
        toast.info("No additional cameras available to start.");
    }
  };

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
                <Button variant="outline" size="icon" onClick={handleCameraChange}>
                  <RefreshCwIcon className="text-primary" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh Screen</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <AudioControls />
          <Button onClick={handleLeaveRoom} size="sm" variant={"destructive"}>
            <PhoneIcon /> Leave Call
          </Button>
          <Button onClick={handleNavigate} size="sm">
            Go to Portal
          </Button>

          {availableSecondaryDevices.length > 0 && (
             <div className="flex items-center gap-1">
                 <Select
                     value={selectedSecondaryDevice || ""}
                     onValueChange={handleSecondaryDeviceChange}
                     disabled={isSecondaryStreaming || !!secondaryProducerRef || isLoadingSecondaryCamera} // Disable select if streaming or starting
                 >
                   <SelectTrigger id="secondary-video-device" className={`${isSecondaryStreaming || !!secondaryProducerRef ? 'hidden' :''}`}>
                    {isLoadingSecondaryCamera ?<Loader2 className="h-4 w-4 animate-spin" /> :<CameraIcon className="h-4 w-4" />}
                     {/* <SelectValue placeholder="Select Webcam..." /> */}
                   </SelectTrigger>
                   <SelectContent>
                     {availableSecondaryDevices.map((device) => (
                       <SelectItem
                         key={device?.deviceId}
                         value={device?.deviceId || "h"}
                       >
                         {device?.label || `Camera ${device?.deviceId.substring(0, 5)}`}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>

               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button
                   className={`${isSecondaryStreaming || !!secondaryProducerRef ? '' :'hidden'}`}
                     variant={secondaryProducerRef ? "destructive" : "outline"}
                     size="icon"
                     onClick={toggleSecondaryStream}
                     disabled={!selectedSecondaryDevice || (!secondaryProducerRef && !selectedSecondaryDevice && availableSecondaryDevices.length === 0)}
                   >
                     {secondaryProducerRef ? (
                       <CameraOffIcon className="h-4 w-4" />
                     ) : (
                       <CameraIcon className="h-4 w-4" />
                     )}
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent>
                    <p>{secondaryProducerRef ? "Stop Webcam" : "Start Webcam"}</p>
                 </TooltipContent>
               </Tooltip>

             </div>
          )}
        </div>
      </div>
    </header>
  );
}
