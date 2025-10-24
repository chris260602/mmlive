"use client";

import { Button } from "@/components/ui/button";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";
import { Monitor, MonitorSmartphone, Smartphone } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const CameraViewToggle = () => {
  const { cameraViewMode, setCameraViewMode, manageConsumersForViewMode } = useStreamStore(
    useShallow((state) => ({
      cameraViewMode: state.cameraViewMode,
      setCameraViewMode: state.setCameraViewMode,
      manageConsumersForViewMode: state.manageConsumersForViewMode,
    }))
  );

  const handleModeChange = async (mode: 'primary' | 'secondary' | 'both') => {
    setCameraViewMode(mode);
    await manageConsumersForViewMode(mode);
  };

  return (
    <div className="flex gap-1 items-center bg-muted p-1 rounded-md">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={cameraViewMode === "primary" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("primary")}
          >
            <Monitor className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Primary Camera Only</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={cameraViewMode === "secondary" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("secondary")}
          >
            <Smartphone className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Webcam Only</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={cameraViewMode === "both" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange("both")}
          >
            <MonitorSmartphone className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Both Cameras (PiP)</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};