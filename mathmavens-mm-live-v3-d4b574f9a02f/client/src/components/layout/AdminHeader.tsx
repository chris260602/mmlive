// components/layout/header.tsx

"use client";

import React, { useState, useEffect } from "react";
import { Clock, InfoIcon, PhoneIcon } from "lucide-react";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";
import { useUserStore } from "@/providers/user-store-provider";
import { StatsDialog } from "../StatsDialog";
import { CameraViewToggle } from "../CameraViewToggle";

// A helper function to format the time with leading zeros
const formatTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const formattedHours = String(hours).padStart(2, "0");
  const formattedMinutes = String(minutes).padStart(2, "0");
  const formattedSeconds = String(seconds).padStart(2, "0");

  return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
};

export function AdminHeader() {
  const router = useRouter();
const [isStatsOpen,setIsStatsOpen] = useState(false);
    const handleGetStats = async() =>{
      setIsStatsOpen(true)
    }
  const { handleLeaveRoom,getTransportStats } = useStreamStore(
    useShallow((state) => ({
      handleLeaveRoom: state.handleLeaveRoom,
      getTransportStats:state.getTransportStats
    }))
  );

  const { roomData } = useUserStore(
    useShallow((state) => ({
      roomData: state.roomData,
    }))
  );

  // State to store the number of seconds that have passed
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const handleNavigate = () => {
    router.push(process.env.NEXT_PUBLIC_ELEARNING_PORTAL || ""); // Or '/lobby', '/join', etc.
  };

  useEffect(() => {
    // This sets up an interval when the component first renders
    const interval = setInterval(() => {
      // Increment the seconds every 1000ms (1 second)
      setElapsedSeconds((prevSeconds) => prevSeconds + 1);
    }, 1000);

    // This is a cleanup function that React runs when the component is removed.
    // It's crucial for preventing memory leaks!
    return () => {
      clearInterval(interval);
    };
  }, []); // The empty array [] ensures this effect runs only once

  return (
    <header className=" flex justify-between px-3 top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className=" flex h-14 justify-between items-center w-full">
        {/* Left Side: Logo/Title */}
        <div className="mr-4 flex">
          <p className="mr-6 flex items-center space-x-2">
            {/* <span className="font-bold text-lg">MM LIVE</span> */}
            <span>{roomData.title}</span>
          </p>
        </div>

        {/* Right Side: Timer */}
        <div className="flex flex-1 items-center justify-end space-x-2">
          <div className="flex flex-1 items-center justify-end space-x-2">
            <CameraViewToggle />
            <Button variant={"ghost"} onClick={handleGetStats}><InfoIcon/></Button>
            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-xs font-semibold text-foreground">
                {formatTime(elapsedSeconds)}
              </span>
            </div>
            <Button onClick={handleLeaveRoom} size="sm" variant={"destructive"}>
              <PhoneIcon /> Leave Call
            </Button>
            <Button onClick={handleNavigate} size="sm">
              Go to Portal
            </Button>
          </div>
        </div>
      </div>
      <StatsDialog isOpen={isStatsOpen} setIsOpen={setIsStatsOpen} getTransportStats={getTransportStats}/>
    </header>
  );
}
