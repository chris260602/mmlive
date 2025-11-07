"use client";

import { Button } from "@/components/ui/button";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";
import { Loader2, Mic, MicOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const AudioControls = () => {
  const {
    isMicMuted,
    audioDevices,
    selectedAudioDevice,
    handleAudioToggle,
    setSelectedAudioDevice,
    isRoomJoined,
    isLoadingMic,
    handleAudioDeviceChange
  } = useStreamStore(
    useShallow((state) => ({
      isMicMuted: state.isMicMuted,
      audioDevices: state.audioDevices,
      selectedAudioDevice: state.selectedAudioDevice,
      handleAudioToggle: state.handleAudioToggle,
      setSelectedAudioDevice: state.setSelectedAudioDevice,
      isRoomJoined: state.isRoomJoined,
      isLoadingMic:state.isLoadingMic,
      handleAudioDeviceChange:state.handleAudioDeviceChange
    }))
  );

  return (
    <div className="flex gap-2 items-center">
      <Select
        value={selectedAudioDevice}
        onValueChange={(val)=>{
          setSelectedAudioDevice(val)
          handleAudioDeviceChange();
        }
      }
        disabled={!isRoomJoined}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select microphone..." />
        </SelectTrigger>
        <SelectContent>
          {audioDevices.map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${device.deviceId.substring(0, 5)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isMicMuted ? "destructive" : "default"}
            size="icon"
            onClick={handleAudioToggle}
            disabled={!isRoomJoined || !selectedAudioDevice || isLoadingMic}
          >
            {isMicMuted ? isLoadingMic ? <Loader2 className="h-4 w-4 animate-spin"/> :<MicOff className="h-4 w-4" /> :<Mic className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isMicMuted ? "Unmute Microphone" : "Mute Microphone"}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};