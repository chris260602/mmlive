import { useStreamStore } from "@/providers/stream-store-provider";
import NetworkIndicator from "../NetworkIndicator";
import { useShallow } from "zustand/shallow";
import { StatsDialog } from "../StatsDialog";
import { useState } from "react";
import { Button } from "../ui/button";
import { InfoIcon, Loader2, Mic, MicOff, UserIcon } from "lucide-react";
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

    isPrimaryDeviceLoading,
    isMicMuted,
  } = useStreamStore(
    useShallow((state) => ({
      connectionQuality: state.connectionQuality,
      getTransportStats: state.getTransportStats,
      handleNuke: state.handleNuke,
      handleScreenChange: state.handleScreenChange,
      isPrimaryDeviceLoading: state.isPrimaryDeviceLoading,
      isMicMuted: state.isMicMuted,
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
        {isPrimaryDeviceLoading && (
          <div className="w-full h-full max-h-[calc(100vh-57px)] absolute z-10 bg-[#1212129e] flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-white h-12 w-12" />
            <p className="text-white mt-3">Loading...</p>
          </div>
        )}

        {stream && (
          <>
            <video
              ref={(videoEl) => {
                if (videoEl) videoEl.srcObject = stream;
              }}
              autoPlay
              playsInline
              className={`h-auto aspect-[10/9] w-full object-contain max-h-[calc(100vh-57px)]`}
            />
          </>
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

        {/* <div className={`${isLocalSpeaking ? '' : 'hidden'} absolute top-[70px] left-4 z-10 bg-green-500 px-3 py-2 rounded-lg flex items-center gap-2 animate-pulse shadow-lg`}>
            <Mic className="w-5 h-5 text-white" />
            <span className="text-white text-sm font-semibold">You are speaking</span>
          </div> */}
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
        {!isMicMuted ? (
          <Mic className="w-4 h-4 text-green-400" />
        ) : (
          <MicOff className="w-4 h-4 text-red-400" />
        )}
      </div>
    </div>
  );
};

export default StudentView;
