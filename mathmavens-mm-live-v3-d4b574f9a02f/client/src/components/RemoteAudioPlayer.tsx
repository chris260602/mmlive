"use client";

import { useEffect, useRef } from "react";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";

export const RemoteAudioPlayer = () => {
  const { remoteAudioStreams } = useStreamStore(
    useShallow((state) => ({
      remoteAudioStreams: state.remoteAudioStreams,
    }))
  );

  return (
    <>
      {Array.from(remoteAudioStreams.entries()).map(([consumerId, stream]) => (
        <AudioElement
          key={consumerId}
          stream={stream}
          consumerId={consumerId}
        />
      ))}
    </>
  );
};

const AudioElement = ({
  stream,
  consumerId,
}: {
  stream: MediaStream;
  consumerId: string;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audioElement = audioRef.current;
    
    if (audioElement && stream) {
      if (audioElement.srcObject !== stream) {
        audioElement.srcObject = stream;
      }

      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          if (error.name === "AbortError") {
            console.log(
              "Audio play() was interrupted, this is often normal in React."
            );
          } else {
            console.error("Error playing remote audio:", error);
          }
        });
      }
    }


    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      style={{ display: "none" }}
      data-consumer-id={consumerId}
    />
  );
};
