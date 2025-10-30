"use client"
import { useEffect, useRef } from "react";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";

export const RemoteAudioPlayer = () => {
  const { remoteAudioStreams } = useStreamStore(
    useShallow((state) => ({
      remoteAudioStreams: state.remoteAudioStreams,
    }))
  );

  console.log("RemoteAudioPlayer render - streams:", remoteAudioStreams.size);

  return (
    <div style={{ display: 'none' }}>
      {Array.from(remoteAudioStreams.entries()).map(([consumerId, stream]) => (
        <AudioElement
          key={consumerId}
          stream={stream}
          consumerId={consumerId}
        />
      ))}
    </div>
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
    
    if (!audioElement || !stream) {
      return;
    }

    console.log("AudioElement: Setting up stream", { consumerId });

    // 1. Set the stream
    audioElement.srcObject = stream;
    
    // 2. Set properties
    audioElement.autoplay = true;
    audioElement.playsInline = true;
    audioElement.muted = false;
    audioElement.volume = 1.0;
    
    // 3. Create a flag to manage autoplay-blocked listeners
    let interactionListenersCleanedUp = false;

    // 4. Define interaction handler
    const playOnInteraction = async () => {
      // Prevent running if already cleaned up or playing
      if (interactionListenersCleanedUp || !audioRef.current) return;
      
      try {
        await audioRef.current.play();
        console.log("✅ Audio playing after interaction:", consumerId);
      } catch (retryError) {
        console.error("Failed to play audio on interaction:", retryError);
      } finally {
        // Clean up listeners immediately after first interaction
        cleanupInteractionListeners();
      }
    };
    
    // 5. Define function to *remove* interaction listeners
    const cleanupInteractionListeners = () => {
      if (interactionListenersCleanedUp) return;
      interactionListenersCleanedUp = true;
      document.removeEventListener('click', playOnInteraction);
      document.removeEventListener('keydown', playOnInteraction);
    };

    // 6. Try to play
    const playAudio = async () => {
      try {
        await audioElement.play();
        console.log("✅ Audio playing successfully:", consumerId);
      } catch (error: any) {
        if (error.name === "NotAllowedError") {
          console.warn("Autoplay blocked, waiting for user interaction", { consumerId });
          // Add listeners, but only if they haven't been added
          document.addEventListener('click', playOnInteraction, { once: true });
          document.addEventListener('keydown', playOnInteraction, { once: true });
        } else if (error.name === "AbortError") {
          // THIS IS THE KEY: This error is expected and not a problem.
          console.log("Audio play request was interrupted (expected):", consumerId);
        } else {
          // Log any other, unexpected errors
          console.error("Error playing remote audio:", error);
        }
      }
    };

    playAudio();

    // 7. Monitor track state
    const audioTrack = stream.getAudioTracks()[0];
    const handleEnded = () => console.log("Audio track ended:", consumerId);
    const handleMuteChange = () => console.log("Audio track mute changed:", { consumerId, muted: audioTrack?.muted });

    if (audioTrack) {
      audioTrack.addEventListener('ended', handleEnded);
      audioTrack.addEventListener('mute', handleMuteChange);
    }

    // 8. Main Cleanup Function
    return () => {
      console.log("Cleaning up audio element:", consumerId);

      // Clean up ALL listeners
      if (audioTrack) {
        audioTrack.removeEventListener('ended', handleEnded);
        audioTrack.removeEventListener('mute', handleMuteChange);
      }
      cleanupInteractionListeners(); // Crucial for preventing listener leaks

      // Clean up the audio element
      if (audioElement) {
        audioElement.pause();
        audioElement.srcObject = null;
      }
    };
  }, [stream, consumerId]); // Dependencies are correct

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      data-consumer-id={consumerId}
      style={{ display: 'none' }}
    />
  );
};