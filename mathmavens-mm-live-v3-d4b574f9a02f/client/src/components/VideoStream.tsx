import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import {
  CableIcon,
  DoorOpenIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  RotateCwSquareIcon,
  ArrowLeft,
  ArrowRight,
  Minimize,
  Mic,
  MicOff,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";
import { USER_DATA_TYPE } from "@/types/user";
import React from "react";

type VideoStreamType = {
  consumerId: string;
  producerId: string;
  stream: MediaStream;
  disable?: string[];
  userData: USER_DATA_TYPE;
  isAdmin?: boolean;
  streamCount: number;
  isActuallyFullscreen?: boolean;
  allStreamIds?: string[];
  currentFullscreenId?: string;
  setFullscreenId?: (id: string | null) => void;
  cameraType?: "primary" | "secondary";
};

const VideoStream = ({
  consumerId,
  producerId,
  stream,
  disable = [],
  userData,
  isAdmin = false,
  streamCount,
  isActuallyFullscreen = false,
  allStreamIds = [],
  currentFullscreenId = "",
  cameraType = "primary",
  setFullscreenId = () => {},
}: VideoStreamType) => {
  const {
    handleRefreshStudent,
    handleKickStudent,
    speakingConsumers,
    remoteAudioStreams,
    mutedStudents,
  } = useStreamStore(
    useShallow((state) => ({
      handleRefreshStudent: state.handleRefreshStudent,
      handleKickStudent: state.handleKickStudent,
      speakingConsumers: state.speakingConsumers,
      remoteAudioStreams: state.remoteAudioStreams,
      mutedStudents: state.mutedStudents,
    }))
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [showStats, setShowStats] = useState(false);

  const [spinStatus, setSpinStatus] = useState(1);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const isDraggingRef = useRef(false);
  const initialPanRef = useRef({ x: 0, y: 0 });
  const initialMousePosRef = useRef({ x: 0, y: 0 });

  const panRef = useRef(pan);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const spinStatusRef = useRef(spinStatus);
  useEffect(() => {
    spinStatusRef.current = spinStatus;
  }, [spinStatus]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const zoomSpeed = 0.1;
      setZoom((prevZoom) => {
        const newZoom =
          event.deltaY < 0 ? prevZoom + zoomSpeed : prevZoom - zoomSpeed;
        const clampedZoom = Math.max(1, newZoom);
        if (clampedZoom <= 1) {
          setPan({ x: 0, y: 0 });
          return 1;
        } else if (clampedZoom >= 10) return 10;
        return clampedZoom;
      });
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (zoomRef.current > 1) {
        event.preventDefault();
        isDraggingRef.current = true;
        initialPanRef.current = panRef.current;
        initialMousePosRef.current = { x: event.clientX, y: event.clientY };
        container.style.cursor = "grabbing";
      }
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const video = videoRef.current;
      if (!video) return;
      const currentZoom = zoomRef.current;
      const currentSpinStatus = spinStatusRef.current;
      const mouseDeltaX = event.clientX - initialMousePosRef.current.x;
      const mouseDeltaY = event.clientY - initialMousePosRef.current.y;
      let panDeltaX = mouseDeltaX;
      let panDeltaY = mouseDeltaY;
      if (currentSpinStatus === 2) {
        panDeltaX = mouseDeltaY;
        panDeltaY = -mouseDeltaX;
      } else if (currentSpinStatus === 3) {
        panDeltaX = -mouseDeltaX;
        panDeltaY = -mouseDeltaY;
      } else if (currentSpinStatus === 4) {
        panDeltaX = -mouseDeltaY;
        panDeltaY = mouseDeltaX;
      }
      const newPanX = initialPanRef.current.x + panDeltaX;
      const newPanY = initialPanRef.current.y + panDeltaY;
      const maxPanX = ((currentZoom - 1) * video.clientWidth) / 2;
      const maxPanY = ((currentZoom - 1) * video.clientHeight) / 2;
      const clampedX = Math.max(-maxPanX, Math.min(maxPanX, newPanX));
      const clampedY = Math.max(-maxPanY, Math.min(maxPanY, newPanY));
      setPan({ x: clampedX, y: clampedY });
    };
    const handleMouseUpOrLeave = () => {
      isDraggingRef.current = false;
      container.style.cursor = "grab";
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUpOrLeave);
    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUpOrLeave);
    };
  }, []);

  const handleToggleFullscreen = () => {
    if (isActuallyFullscreen) {
      setFullscreenId(null); // Tell parent to exit fullscreen
    } else {
      setFullscreenId(consumerId); // Tell parent to enter fullscreen with THIS stream
    }
  };

  const handleZoomIn = () =>
    setZoom((z) => {
      if (z < 10) return z + 0.2;
      return 10;
    });

  const handleZoomOut = () => {
    setZoom((prevZoom) => {
      const newZoom = prevZoom - 0.2;
      if (newZoom <= 1) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      const scale = newZoom / prevZoom;
      setPan((p) => ({ x: p.x * scale, y: p.y * scale }));
      return newZoom;
    });
  };

  const handleSpin = () => setSpinStatus((prev) => (prev >= 4 ? 1 : prev + 1));

  const getRotationTransform = () => {
    switch (spinStatus) {
      case 2:
        return "rotate(90deg)";
      case 3:
        return "rotate(180deg)";
      case 4:
        return "rotate(-90deg)";
      default:
        return "rotate(0deg)";
    }
  };

  const t = async () =>
    await handleRefreshStudent(userData.peerId, userData.id);

  const getDynamicVideoStyles = (): React.CSSProperties => {
    let scale = zoom;
    if (spinStatus === 2 || spinStatus === 4) {
      const video = videoRef.current;
      const container = containerRef.current;
      if (video && container && container.clientWidth > 0) {
        const scaleToFit = container.clientHeight / container.clientWidth;
        scale *= scaleToFit;
      }
    }
    const styles: React.CSSProperties = {
      transform: `${getRotationTransform()} translate(${pan.x}px, ${
        pan.y
      }px) scale(${scale})`,
      transformOrigin: "center center",
    };
    return styles;
  };

  const getVideoSizingClasses = () => {
    if (isActuallyFullscreen) return "w-full h-full object-contain";
    return "w-auto h-full aspect-[15/9] object-contain";
  };

  const toggleShowStudentInfo = () => {
    setShowStats((prevState) => !prevState);
  };

  const getContainerSizing = () => {
    if (isActuallyFullscreen) {
      return "w-full h-full";
    }
    if (streamCount <= 1) {
      return "w-full h-[calc(100vh-60px)]";
    } else if (streamCount <= 8) {
      return "h-[calc(50vh-30px)]";
    } else {
      return "h-[240px]";
    }
  };

  const handleNextStream = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = allStreamIds.indexOf(currentFullscreenId);
    if (currentIndex === -1) return;

    const nextIndex = (currentIndex + 1) % allStreamIds.length;
    setFullscreenId(allStreamIds[nextIndex]);
  };

  const handlePrevStream = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = allStreamIds.indexOf(currentFullscreenId);
    if (currentIndex === -1) return;

    const prevIndex =
      (currentIndex - 1 + allStreamIds.length) % allStreamIds.length;
    setFullscreenId(allStreamIds[prevIndex]);
  };
  console.log(mutedStudents, "mutedstudent");
  const isMuted = mutedStudents?.get(userData.id) ?? true;

  // const isSpeaking = speakingConsumers.has(consumerId);
  // speakingConsumers.forEach((a) => console.log(a, "INI IS SPIKING"));
  // // Check if this student has audio (mic enabled)
  // // We need to find the audio consumer for this student
  // const hasAudioEnabled = Array.from(remoteAudioStreams.keys()).some(
  //   (audioConsumerId) => {
  //     // Audio consumers belong to same user, we can check by comparing userData
  //     return audioConsumerId.includes(userData.id);
  //   }
  // );

  return (
    <div
      key={consumerId}
      ref={containerRef}
      className={`group relative border-4 ${getContainerSizing()} overflow-hidden bg-black flex justify-center items-center cursor-grab`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={getVideoSizingClasses()}
        onDoubleClick={handleToggleFullscreen} // Use new handler
        style={getDynamicVideoStyles()}
      />
      {/* {isSpeaking && (
        <div className="absolute top-2 left-2 z-20 bg-green-500 px-2 py-1 rounded-md flex items-center gap-1 animate-pulse">
          <Mic className="w-4 h-4 text-white" />
          <span className="text-white text-xs font-semibold">Speaking</span>
        </div>
      )} */}

      {isActuallyFullscreen && allStreamIds.length > 1 && (
        <>
          <Button
            variant="secondary"
            size="icon"
            className="absolute z-20 left-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full size-12"
            onClick={handlePrevStream}
          >
            <ArrowLeft className="text-white" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="absolute z-20 right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full size-12"
            onClick={handleNextStream}
          >
            <ArrowRight className="text-white" />
          </Button>
        </>
      )}

      {isAdmin && showStats && (
        <div className="absolute top-1 left-1 pointer-events-none">
          <p className="font-semibold text-sm text-white bg-black bg-opacity-50 px-2 py-1 rounded">
            {userData.peerId}
          </p>
          <p className="font-semibold text-sm text-white bg-black bg-opacity-50 px-2 py-1 rounded">
            Consumer {consumerId || ""}
          </p>
          <p className="font-semibold text-sm text-white bg-black bg-opacity-50 px-2 py-1 rounded">
            Producer {producerId || ""}
          </p>
        </div>
      )}

      <div className="absolute bottom-1 left-1 pointer-events-none">
        <p className="font-semibold text-sm text-white bg-black bg-opacity-50 px-2 py-1 rounded">
          <div className="flex gap-1 items-center">
            {userData?.child_name}

            {isMuted ? (
              <MicOff className="w-4 h-4 text-red-400" />
            ) : (
              <Mic className="w-4 h-4 text-green-400" />
            )}
          </div>

          {cameraType === "secondary" && (
            <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded">
              Cam 2
            </span>
          )}
        </p>
      </div>

      <div className="z-10 absolute flex gap-2 right-1 top-1 transition-opacity opacity-0 group-hover:opacity-100 duration-300">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="size-8"
              onClick={() => handleKickStudent(userData.peerId, userData.id)}
            >
              <DoorOpenIcon className="text-white" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Kick Participant</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {!disable.includes("spin") && (
        <div className="z-10 absolute flex gap-2 right-1 bottom-1 transition-opacity opacity-0 group-hover:opacity-100 duration-300">
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-8"
                  onClick={toggleShowStudentInfo}
                >
                  <InfoIcon className="text-white" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Info</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-8"
                disabled={zoom === 1}
                onClick={handleZoomOut}
              >
                <MinusIcon className="text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom Out</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-8"
                disabled={zoom >= 10}
                onClick={handleZoomIn}
              >
                <PlusIcon className="text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom In</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-8"
                onClick={t}
              >
                <CableIcon className="text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh Stream</p>
            </TooltipContent>
          </Tooltip>

          {isActuallyFullscreen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-8"
                  onClick={handleToggleFullscreen}
                >
                  <Minimize className="text-white" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Exit Fullscreen</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-8"
                onClick={handleSpin}
              >
                <RotateCwSquareIcon className="text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rotate Screen</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
};

export default VideoStream;
