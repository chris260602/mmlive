import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock, Loader2, Users, Webcam } from "lucide-react";
import VideoStream from "../VideoStream";
import { REMOTE_STREAM_TYPE } from "@/utils/deviceUtils";
import { useUserStore } from "@/providers/user-store-provider";
import { useShallow } from "zustand/shallow";
import React, { useEffect, useRef, useState } from "react"; // Import React hooks
import { useStreamStore } from "@/providers/stream-store-provider";
import { Rnd } from "react-rnd";
import { USER_DATA_TYPE } from "@/types/user";
import { RemoteAudioPlayer } from "../RemoteAudioPlayer";

const TeacherView = ({ streams }: { streams: REMOTE_STREAM_TYPE[] }) => {
  const { currUserData } = useUserStore(
    useShallow((state) => ({
      currUserData: state.userData,
    }))
  );
  const { cameraViewMode: viewMode } = useStreamStore(
    useShallow((state) => ({
      cameraViewMode: state.cameraViewMode,
    }))
  );

  // --- State and Ref for Fullscreen Management ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreenConsumerId, setFullscreenConsumerId] = useState<
    string | null
  >(null);

  const streamsByUser = React.useMemo(() => {
    const grouped = new Map<
      string,
      {
        primary?: REMOTE_STREAM_TYPE;
        secondary?: REMOTE_STREAM_TYPE;
        userData: USER_DATA_TYPE;
      }
    >();

    streams.forEach((stream) => {
      const userId = stream.userData.id;
      if (!grouped.has(userId)) {
        grouped.set(userId, { userData: stream.userData });
      }

      const cameraType = stream.appData?.cameraType || "primary";
      const userStreams = grouped.get(userId)!;

      if (cameraType === "primary") {
        userStreams.primary = stream;
      } else {
        userStreams.secondary = stream;
      }
    });

    return grouped;
  }, [streams]);
  console.log(streamsByUser.size, "byuser");

  // Filter streams based on view mode
  const filteredStreams = React.useMemo(() => {
    const result: Array<{
      main: REMOTE_STREAM_TYPE;
      pip?: REMOTE_STREAM_TYPE;
      userData: USER_DATA_TYPE;
    }> = [];

    streamsByUser.forEach(({ primary, secondary, userData }) => {
      if (viewMode === "primary" && primary) {
        result.push({ main: primary, userData });
      } else if (viewMode === "secondary" && secondary) {
        result.push({ main: secondary, userData });
      } else if (viewMode === "both") {
        // Primary as main, secondary as PiP
        if (primary) {
          result.push({
            main: primary,
            pip: secondary,
            userData,
          });
        } else if (secondary) {
          // If only secondary exists, show it as main
          result.push({ main: secondary, userData });
        }
      }
    });

    return result;
  }, [streamsByUser, viewMode]);
  console.log(filteredStreams, "filteredstreams");

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
    if (filteredStreams.length <= 1) {
      return "w-full h-full grid grid-cols-1";
    } else if (filteredStreams.length <= 4) {
      return "w-full h-full grid grid-cols-1 md:grid-cols-2";
    } else if (filteredStreams.length <= 6) {
      return "w-full h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    } else {
      return "w-full h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
    }
  };

  // --- Prepare data for fullscreen/grid ---
  const streamIds = filteredStreams.map((s) => s.main.consumerId);
  const fullscreenStream = filteredStreams.find(
    (s) => s.main.consumerId === fullscreenConsumerId
  );
  const isAdmin = currUserData?.live_role === "Admin";

  return (
    <div ref={containerRef} className="w-full h-full">
      <RemoteAudioPlayer />
      {fullscreenStream ? (
        <div className="relative w-full h-full">
          <VideoStream
            key={fullscreenStream.main.consumerId}
            consumerId={fullscreenStream.main.consumerId}
            producerId={fullscreenStream.main.producerId as string}
            stream={fullscreenStream.main.stream}
            userData={fullscreenStream.main.userData}
            streamCount={filteredStreams.length}
            isAdmin={isAdmin}
            isActuallyFullscreen={true}
            allStreamIds={streamIds}
            currentFullscreenId={fullscreenConsumerId as string}
            setFullscreenId={setFullscreenConsumerId}
          />

          {/* PiP secondary view in fullscreen */}
          {fullscreenStream.pip && (
            <Rnd
              default={{
                x: 0,
                y: 0,
                width: 288,
                height: 160,
              }}
              minHeight={80}
              maxHeight={320}
              lockAspectRatio
              bounds={"parent"}
            >
              <div className="border-2 w- border-white rounded overflow-hidden shadow-md m-3">
                <video
                  ref={(videoEl) => {
                    if (videoEl)
                      videoEl.srcObject = fullscreenStream.pip!.stream;
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </Rnd>
          )}
        </div>
      ) : (
        <>
          {filteredStreams.length === 0 && streamsByUser.size > 0 ? (
            <main className="flex items-center justify-center min-h-screen p-4">
              <Card className="w-full max-w-md text-center shadow-lg">
                <CardHeader>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900 mb-4">
                    {/* Icon changed to 'Users' to show students are present */}
                    <Users className="h-10 w-10 text-green-600 dark:text-green-300" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    Students Have Joined
                  </CardTitle>
                  <CardDescription className="text-muted-foreground pt-2">
                    Your class is in session, but the current view is empty.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center space-y-4 pt-4">
                  {/* Removed the loader, as this is not a waiting state */}
                  <p className="text-sm text-muted-foreground">
                    This might be because no one is opening their camera, or you
                    need to select a different layout.
                  </p>
                </CardContent>
              </Card>
            </main>
          ) : filteredStreams.length === 0 && streamsByUser.size <= 0 ? (
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
              {filteredStreams.map(({ main, pip, userData }) => (
                <div key={main.consumerId} className="relative">
                  <VideoStream
                    consumerId={main.consumerId}
                    producerId={main.producerId as string}
                    stream={main.stream}
                    userData={userData}
                    streamCount={filteredStreams.length}
                    isAdmin={isAdmin}
                    isActuallyFullscreen={false}
                    setFullscreenId={setFullscreenConsumerId}
                    allStreamIds={[]}
                    currentFullscreenId=""
                  />

                  {/* PiP secondary view */}
                  {pip && viewMode === "both" && (
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
                            if (videoEl) videoEl.srcObject = pip.stream;
                          }}
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </Rnd>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherView;
