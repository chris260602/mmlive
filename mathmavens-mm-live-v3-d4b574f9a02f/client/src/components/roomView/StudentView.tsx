import { useStreamStore } from "@/providers/stream-store-provider";
import NetworkIndicator from "../NetworkIndicator";
import { useShallow } from "zustand/shallow";
import { StatsDialog } from "../StatsDialog";
import { useState } from "react";
import { Button } from "../ui/button";
import { InfoIcon } from "lucide-react";

const StudentView = ({ stream }: { stream: MediaStream }) => {
  const { connectionQuality, getTransportStats, handleNuke } = useStreamStore(
    useShallow((state) => ({
      connectionQuality: state.connectionQuality,
      getTransportStats: state.getTransportStats,
      handleNuke: state.handleNuke,
    }))
  );

  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const handleGetStats = async () => {
    setIsStatsOpen(true);
  };

  return (
    <div className="flex w-full">
      {/* <Button onClick={handleNuke}>Nuke</Button> */}

      <div
        key={"user"}
        className="w-full h-full top-0 flex justify-center items-center bg-[#121212]"
      >
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
