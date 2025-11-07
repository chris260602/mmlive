"use client";

import { Mic, MicOff, Users } from "lucide-react";
import { useStreamStore } from "@/providers/stream-store-provider";
import { useShallow } from "zustand/shallow";
import { useUserStore } from "@/providers/user-store-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const StudentListSidebar = () => {
  const {
    remoteStreams,
    speakingConsumers,
    isLocalSpeaking,
    isMicMuted,
    remoteAudioStreams,
  } = useStreamStore(
    useShallow((state) => ({
      remoteStreams: state.remoteStreams,
      speakingConsumers: state.speakingConsumers,
      isLocalSpeaking: state.isLocalSpeaking,
      isMicMuted: state.isMicMuted,
      remoteAudioStreams: state.remoteAudioStreams,
    }))
  );

  const { userData } = useUserStore(
    useShallow((state) => ({
      userData: state.userData,
    }))
  );

  // Group streams by user (since one user can have primary + secondary camera)
  const groupedStudents = new Map<string, {
    userData: any;
    consumers: typeof remoteStreams;
    hasAudio: boolean;
    isSpeaking: boolean;
  }>();

  remoteStreams.forEach((stream) => {
    const userId = stream.userData.id;
    
    if (!groupedStudents.has(userId)) {
      groupedStudents.set(userId, {
        userData: stream.userData,
        consumers: [],
        hasAudio: false,
        isSpeaking: false,
      });
    }
    
    const group = groupedStudents.get(userId)!;
    group.consumers.push(stream);
    
    // Check if this consumer is speaking
    if (speakingConsumers.has(stream.consumerId)) {
      group.isSpeaking = true;
    }
  });

  // Check for audio consumers
  remoteAudioStreams.forEach((audioStream, audioConsumerId) => {
    // Try to find which student this audio belongs to
    // This is a simple approach - you might need to adjust
    for (const [userId, group] of groupedStudents.entries()) {
      // If any consumer from this user matches, mark as having audio
      if (group.consumers.some(c => c.producerId === audioConsumerId || 
                                     c.consumerId === audioConsumerId)) {
        group.hasAudio = true;
        
        // Check if this audio consumer is speaking
        if (speakingConsumers.has(audioConsumerId)) {
          group.isSpeaking = true;
        }
      }
    }
  });

  return (
    <Card className="w-80 h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Participants
        </CardTitle>
        <CardDescription>
          {groupedStudents.size + 1} in this class
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4">
          <div className="space-y-2 pb-4">
            {/* Local User (You) */}
            <div
              className={`
                flex items-center gap-3 p-3 rounded-lg transition-all duration-200
                ${isLocalSpeaking 
                  ? 'bg-green-100 ring-2 ring-green-500 shadow-md dark:bg-green-900/20' 
                  : 'bg-muted hover:bg-muted/80'
                }
              `}
            >
              {/* Avatar */}
              <div
                className={`
                  flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                  font-semibold text-white transition-all duration-200
                  ${isLocalSpeaking 
                    ? 'bg-green-600 scale-110' 
                    : 'bg-blue-600'
                  }
                `}
              >
                {userData?.child_name?.charAt(0).toUpperCase() || 'Y'}
              </div>
              
              {/* Name and Status */}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {userData?.child_name || 'You'} <span className="text-muted-foreground">(You)</span>
                </div>
                {isLocalSpeaking && (
                  <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                    Speaking...
                  </div>
                )}
              </div>
              
              {/* Mic Icon */}
              <div className="flex-shrink-0">
                {isMicMuted ? (
                  <MicOff className="w-5 h-5 text-red-500" />
                ) : (
                  <Mic
                    className={`
                      w-5 h-5 transition-all duration-200
                      ${isLocalSpeaking 
                        ? 'text-green-600 scale-125' 
                        : 'text-muted-foreground'
                      }
                    `}
                  />
                )}
              </div>
            </div>

            {/* Remote Students */}
            {Array.from(groupedStudents.values()).map((student) => {
              const studentName = student.userData?.child_name || 'Unknown Student';
              const isSpeaking = student.isSpeaking;
              const hasAudio = student.hasAudio;

              return (
                <div
                  key={student.userData.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg transition-all duration-200
                    ${isSpeaking 
                      ? 'bg-green-100 ring-2 ring-green-500 shadow-md dark:bg-green-900/20' 
                      : 'bg-muted hover:bg-muted/80'
                    }
                  `}
                >
                  {/* Avatar */}
                  <div
                    className={`
                      flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                      font-semibold text-white transition-all duration-200
                      ${isSpeaking 
                        ? 'bg-green-600 scale-110' 
                        : 'bg-gray-600'
                      }
                    `}
                  >
                    {studentName.charAt(0).toUpperCase()}
                  </div>
                  
                  {/* Name and Status */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {studentName}
                    </div>
                    {isSpeaking && (
                      <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                        Speaking...
                      </div>
                    )}
                  </div>
                  
                  {/* Mic Icon */}
                  <div className="flex-shrink-0">
                    {!hasAudio ? (
                      <MicOff className="w-5 h-5 text-red-500" />
                    ) : (
                      <Mic
                        className={`
                          w-5 h-5 transition-all duration-200
                          ${isSpeaking 
                            ? 'text-green-600 scale-125' 
                            : 'text-muted-foreground'
                          }
                        `}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {groupedStudents.size === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No other participants yet</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};