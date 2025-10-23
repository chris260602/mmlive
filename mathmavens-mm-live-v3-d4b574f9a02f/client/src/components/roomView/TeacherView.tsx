import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock, Loader2 } from "lucide-react";
import VideoStream from "../VideoStream";
import { REMOTE_STREAM_TYPE } from "@/utils/deviceUtils";
import { useUserStore } from "@/providers/user-store-provider";
import { useShallow } from "zustand/shallow";
import React, { useEffect, useRef, useState } from "react"; // Import React hooks

const TeacherView = ({ streams }: { streams: REMOTE_STREAM_TYPE[] }) => {
  const { currUserData } = useUserStore(
    useShallow((state) => ({
      currUserData: state.userData,
    }))
  );

  // --- State and Ref for Fullscreen Management ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreenConsumerId, setFullscreenConsumerId] = useState<
    string | null
  >(null);

  // Effect to listen for 'Esc' key press to exit fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        // User exited fullscreen (e.g., pressed Esc), sync our state
        setFullscreenConsumerId(null);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (
      fullscreenConsumerId &&
      containerRef.current &&
      !document.fullscreenElement
    ) {
      // Enter fullscreen
      containerRef.current
        .requestFullscreen()
        .catch((err) =>
          console.error(
            "Error attempting to enable full-screen mode:",
            err.message
          )
        );
    } else if (!fullscreenConsumerId && document.fullscreenElement) {
      // Exit fullscreen
      document.exitFullscreen();
    }
  }, [fullscreenConsumerId]); // Runs when fullscreenConsumerId changes

  // --- Grid Layout Logic ---
  const flexibleGridLayout = () => {
    if (streams.length <= 1) {
      return "w-full h-full grid grid-cols-1";
    } else if (streams.length <= 4) {
      return "w-full h-full grid grid-cols-1 md:grid-cols-2";
    } else if (streams.length <= 6) {
      return "w-full h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    } else {
      return "w-full h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
    }
  };

  // --- Prepare data for fullscreen/grid ---
  const streamIds = streams.map((s) => s.consumerId);
  const fullscreenStream = streams.find(
    (s) => s.consumerId === fullscreenConsumerId
  );
  const isAdmin = currUserData?.live_role === "Admin";

  return (
    <div
      ref={containerRef}
      className="w-full h-full " // Container handles fullscreen
    >
      {fullscreenStream ? (
        <VideoStream
          key={fullscreenStream.consumerId}
          consumerId={fullscreenStream.consumerId}
          producerId={fullscreenStream.producerId as string}
          stream={fullscreenStream.stream}
          userData={fullscreenStream.userData}
          streamCount={streams.length}
          isAdmin={isAdmin}
          isActuallyFullscreen={true}
          allStreamIds={streamIds}
          currentFullscreenId={fullscreenConsumerId as string}
          setFullscreenId={setFullscreenConsumerId}
        />
      ) : (
        <>
          {streams.length === 0 ? (
            <main className="flex items-center justify-center min-h-screen p-4">
              <Card className="w-full max-w-md text-center shadow-lg">
                <CardHeader>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
                    <Clock className="h-10 w-10 text-blue-600 dark:text-blue-300" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    Waiting for students
                  </CardTitle>
                  <CardDescription className="text-muted-foreground pt-2">
                    You have successfully joined the room. Please wait for
                    students to join the class.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center space-y-4 pt-4">
                  <Loader2 className="animate-spin h-8 w-8 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    This page will automatically update once a student joins.
                  </p>
                </CardContent>
              </Card>
            </main>
          ) : (
            <div className={flexibleGridLayout()}>
              {streams.map(({ stream, consumerId, producerId, userData }) => (
                <VideoStream
                  key={consumerId}
                  consumerId={consumerId}
                  producerId={producerId as string}
                  stream={stream}
                  userData={userData}
                  streamCount={streams.length}
                  isAdmin={isAdmin}
                  isActuallyFullscreen={false}
                  setFullscreenId={setFullscreenConsumerId}
                  allStreamIds={[]} // Not needed in grid mode
                  currentFullscreenId="" // Not needed in grid mode
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherView;
