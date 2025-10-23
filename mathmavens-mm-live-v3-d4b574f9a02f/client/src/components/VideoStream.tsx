import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { RotateCwSquareIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type VideoStreamType = {
  consumerId: string;
  stream: MediaStream;
  disable?: string[];
  userData: object;
};

const VideoStream = ({
  consumerId,
  stream,
  disable = [],
  userData,
}: VideoStreamType) => {
  const videoRef = useRef(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [spinStatus, setSpinStatus] = useState(1);
  const [isFullscreen,setIsFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(()=>{
    if(checkIsFullscreen()){
      setIsFullscreen(true);
    }else{
      setIsFullscreen(false)
    }
  },[])

  const handleFullscreen = () => {
    const elem = containerRef.current;
    if (!elem) return;

    if (!document.fullscreenElement) {
      setIsFullscreen(true);
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen)
        elem.webkitRequestFullscreen(); // Safari
      else if (elem.msRequestFullscreen) elem.msRequestFullscreen(); // IE11
    } else {
      setIsFullscreen(false)
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const checkIsFullscreen = () =>{
    return document.fullscreenElement
  }

  const handleSpin = () => {
    if (spinStatus >= 4) {
      setSpinStatus(1);
    } else {
      setSpinStatus((prevState) => prevState + 1);
    }
  };
  const getVideoClasses = () => {
    if(isFullscreen){
      switch (spinStatus) {
        case 2: // Rotated 90 degrees (Vertical)
        return "h-auto aspect-[9/10] w-full max-w-[98vh] object-contain max-h-screen rotate-90";
        case 3: // Rotated 180 degrees (Upside-down Horizontal)
        return "h-auto aspect-[10/9] w-full object-contain max-h-[calc(100vh-8px)] rotate-180";
        case 4: // Rotated -90 degrees (Vertical)
        return "h-auto aspect-[9/10] w-full max-w-[98vh] object-contain max-h-screen -rotate-90";
        default: // Case 1 (Standard Horizontal)
        return "h-auto aspect-[10/9] w-full object-contain max-h-[calc(100vh-8px)]";

      }
    }else{
      switch (spinStatus) {
        case 2: // Rotated 90 degrees (Vertical)
          return "w-auto h-full max-h-[70vh] aspect-[10/9] object-contain mx-auto rotate-90";
        case 3: // Rotated 180 degrees (Upside-down Horizontal)
          return "w-full aspect-[10/9] object-contain rotate-180";
        case 4: // Rotated -90 degrees (Vertical)
          return "w-auto h-full max-h-[70vh] aspect-[10/9] object-contain mx-auto -rotate-90";
        default: // Case 1 (Standard Horizontal)
          return "w-full aspect-[10/9] object-contain";
      }
    }
    
  };
  const spinStyle = () => {
    if (spinStatus === 1) {
      return "h-auto aspect-[10/9] w-full object-contain max-h-[calc(100vh-8px)]";
    } else if (spinStatus === 2) {
      return "h-auto aspect-[9/10] w-auto max-w-[calc(100vh-20px)] object-contain rotate-90";
    } else if (spinStatus === 3) {
      return "h-auto aspect-[10/9] w-full object-contain max-h-[calc(100vh-8px)] rotate-180";
    } else if (spinStatus === 4) {
      return "h-auto aspect-[9/10] w-full max-w-[98vh] object-contain max-h-screen -rotate-90";
    }
  };
  return (
    <div ref={containerRef} key={consumerId} className="relative border-4">
      <div className="flex justify-center items-center">
      <video
        ref={videoRef}
        // ref={(videoEl) => {
        //   if (videoEl) videoEl.srcObject = stream;
        // }}
        autoPlay
        playsInline
        className={`${getVideoClasses()}`}
        onDoubleClick={handleFullscreen}
      />
      </div>
      
      <div className="flex justify-center">
        <p className="font-semibold text-sm">{userData?.child_name}</p>
      </div>
      {!disable.find((val) => val === "spin") && (
        <div className="z-10 absolute right-1 bottom-1">
          <Tooltip>
            <TooltipTrigger  asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-8"
                onClick={handleSpin}
              >
                <RotateCwSquareIcon className="text-white"/>
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
