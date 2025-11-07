"use client";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";
import { useUserStore } from "@/providers/user-store-provider";
import { toast } from "sonner";
import { getAllUserVideoInput } from "@/utils/deviceUtils";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Button
} from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  CameraIcon,
  CameraOffIcon,
  Loader2,
  RefreshCwIcon,
  SettingsIcon,
  PhoneIcon,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import { AudioControls } from "./AudioControls";

export function StudentSettingsBar() {
  const router = useRouter();
  const { roomData } = useUserStore(useShallow((state) => ({ roomData: state.roomData })));

  const {
    videoDevices,
    selectedDevice,
    setSelectedDevice,
    setVideoDevices,
    setIsDeviceLoading,
    handleCameraChange,

    secondaryProducerRef,
    selectedSecondaryDevice,
    isSecondaryStreaming,
    isLoadingSecondaryCamera,
    handleSecondaryCamera,
    stopSecondaryCamera,
    setSelectedSecondaryDevice,

    handleLeaveRoom,
  } = useStreamStore(useShallow((state) => ({
    videoDevices: state.videoDevices,
    selectedDevice: state.selectedDevice,
    setSelectedDevice: state.setSelectedDevice,
    setVideoDevices: state.setVideoDevices,
    setIsDeviceLoading: state.setIsDeviceLoading,
    handleCameraChange: state.handleCameraChange,

    secondaryProducerRef: state.secondaryProducerRef,
    selectedSecondaryDevice: state.selectedSecondaryDevice,
    isSecondaryStreaming: state.isSecondaryStreaming,
    isLoadingSecondaryCamera: state.isLoadingSecondaryCamera,
    handleSecondaryCamera: state.handleSecondaryCamera,
    stopSecondaryCamera: state.stopSecondaryCamera,
    setSelectedSecondaryDevice: state.setSelectedSecondaryDevice,

    handleLeaveRoom: state.handleLeaveRoom,
  })));

  const availableSecondaryDevices = videoDevices.filter(
    (device) => device.deviceId !== selectedDevice
  );

  const handleSecondaryDeviceChange = (deviceId: string) => {
    setSelectedSecondaryDevice(deviceId);
    toggleSecondaryStream();
  };

  const toggleSecondaryStream = () => {
    if (secondaryProducerRef) {
      stopSecondaryCamera();
    } else if (selectedSecondaryDevice) {
      handleSecondaryCamera(selectedSecondaryDevice);
    } else if (availableSecondaryDevices.length > 0) {
      const firstAvailable = availableSecondaryDevices[0].deviceId;
      setSelectedSecondaryDevice(firstAvailable);
      handleSecondaryCamera(firstAvailable);
    } else {
      toast.info("No additional cameras available.");
    }
  };

  const refreshDevice = async () => {
    setIsDeviceLoading(true);
    try {
      const devices = await getAllUserVideoInput();
      setVideoDevices(devices);
      toast.success("Devices refreshed!");
    } catch (err) {
      setVideoDevices([]);
      toast.error("Failed to detect devices");
    } finally {
      setIsDeviceLoading(false);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[340px] sm:w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Device Settings</SheetTitle>
          <SheetDescription>
            Manage your camera, microphone, and secondary devices
          </SheetDescription>
        </SheetHeader>
<div className="mt-6 px-4 space-y-6">
          {/* Primary Camera */}
          <div>
            <h3 className="text-sm font-medium mb-2">Primary Camera</h3>
            <div className="flex gap-2">
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select camera..." />
                </SelectTrigger>
                <SelectContent>
                  {videoDevices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || "Unknown device"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={refreshDevice}>
                    <RefreshCwIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh devices</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Separator />

          {/* Secondary Camera */}
          <div>
            <h3 className="text-sm font-medium mb-2">Secondary Camera</h3>
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

          <Separator />

          {/* Audio Controls */}
          <div>
            <h3 className="text-sm font-medium mb-2">Audio</h3>
            <AudioControls />
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-2">
            <Button
              onClick={handleLeaveRoom}
              variant="destructive"
              className="w-full"
            >
              <PhoneIcon className="mr-2 h-4 w-4" /> Leave Call
            </Button>

            <Button
              onClick={() => router.push(process.env.NEXT_PUBLIC_ELEARNING_PORTAL || "")}
              className="w-full"
            >
              Go to Portal
            </Button>
          </div>
        </div>
        
      </SheetContent>
    </Sheet>
  );
}
