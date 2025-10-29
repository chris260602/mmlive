import { useStreamStore } from "@/providers/stream-store-provider";
import NetworkIndicator from "../NetworkIndicator";
import { useShallow } from "zustand/shallow";
import { StatsDialog } from "../StatsDialog";
import { useState } from "react";
import { Button } from "../ui/button";
import { InfoIcon, UserIcon } from "lucide-react";
import { Rnd } from "react-rnd";
import { RemoteAudioPlayer } from "../RemoteAudioPlayer";

const StudentView = ({
  stream,
  stream2,
}: {
  stream: MediaStream;
  stream2?: MediaStream;
}) => {
  const {
    connectionQuality,
    getTransportStats,
    handleNuke,
    handleScreenChange,
  } = useStreamStore(
    useShallow((state) => ({
      connectionQuality: state.connectionQuality,
      getTransportStats: state.getTransportStats,
      handleNuke: state.handleNuke,
      handleScreenChange: state.handleScreenChange,
    }))
  );

  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const handleGetStats = async () => {
    setIsStatsOpen(true);
  };

  // const handleShareScreen = async() =>{
  //   await navigator.mediaDevices.getDisplayMedia()
  // }

  return (
    <div className="flex w-full">
      <RemoteAudioPlayer />
      {/* <Button onClick={handleNuke}>Nuke</Button> */}
      {/* <Button onClick={handleScreenChange}>Share screen</Button> */}
      <div
        key={"user"}
        className="w-full h-full top-0 flex justify-center items-center bg-[#121212]"
      >
        {/* {stream && !stream2 ? <video
            ref={(videoEl) => {
              if (videoEl) videoEl.srcObject = stream;
            }}
            autoPlay
            playsInline
            className={`h-auto aspect-[10/9] w-full object-contain max-h-[calc(100vh-57px)]`}
          />:
          <>
          <video
            ref={(videoEl) => {
              if (videoEl) videoEl.srcObject = stream;
            }}
            autoPlay
            playsInline
            className={`h-auto aspect-[10/9] w-full object-contain max-h-[calc(100vh-57px)]`}
          />
          
          <video
            ref={(videoEl) => {
              if (videoEl) videoEl.srcObject = stream2;
            }}
            autoPlay
            playsInline
            className={`h-auto aspect-[10/9] w-[200px] absolute top-[34px] left-3 object-contain max-h-[calc(100vh-57px)]`}
          /></>
          
          
          } */}
        {stream && (
          <video
            ref={(videoEl) => {
              if (videoEl) videoEl.srcObject = stream;
            }}
            autoPlay
            playsInline
            className={`h-auto aspect-[10/9] w-full object-contain max-h-[calc(100vh-57px)]`}
          />
        )}
        {stream2 && (
          <Rnd
            default={{
              x: 0,
              y: 0,
              width: 144,
              height: 96,
            }}
            minHeight={40}
            maxHeight={320}
            lockAspectRatio
            bounds={"parent"}
          >
            <div className="border-2 border-white rounded overflow-hidden shadow-md m-3">
              <video
                ref={(videoEl) => {
                  if (videoEl) videoEl.srcObject = stream2;
                }}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
          </Rnd>
          // <video
          //   ref={(videoEl) => {
          //     if (videoEl) videoEl.srcObject = stream2;
          //   }}
          //   autoPlay
          //   playsInline
          //   className={`h-full aspect-[10/9] w-full object-contain max-h-[calc(100vh-57px)]`}
          // />
        )}
      </div>

      <StatsDialog
        isOpen={isStatsOpen}
        setIsOpen={setIsStatsOpen}
        getTransportStats={getTransportStats}
      />
      <div className="absolute top-[64px] right-2">
        <Button variant={"ghost"} onClick={handleGetStats}>
          <InfoIcon />
        </Button>
      </div>
      <div className="absolute flex gap-1 items-center bottom-3 left-3 bg-black px-2 py-0.5 rounded font-bold text-xs text-white ">
        <NetworkIndicator strength={connectionQuality} />
        <span>You</span>
      </div>
    </div>
  );
};

export default StudentView;
