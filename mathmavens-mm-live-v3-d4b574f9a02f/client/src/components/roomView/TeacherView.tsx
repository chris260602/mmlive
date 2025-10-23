import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Loader2 } from "lucide-react";
import VideoStream from "../VideoStream"

const TeacherView = ({streams} :{ streams:MediaStream[]}) =>{
    return (
      <>
      {streams.length ===0 ?
      <main className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
            <Clock className="h-10 w-10 text-blue-600 dark:text-blue-300" />
          </div>
          <CardTitle className="text-2xl font-bold">Waiting for students</CardTitle>
          <CardDescription className="text-muted-foreground pt-2">
            You have successfully joined the room. Please wait for students to join the class.
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
      :<div className="w-full h-full grid grid-cols-4 gap-4 gap-y-8">
        {streams.map(({ stream, consumerId,userData }) => (
          // <div key={consumerId} className="relative border-4">
          // <>
          // {console.log(userData)}
          <VideoStream
            key={consumerId}
            stream={stream}
            consumerId={consumerId}
            userData={userData}
            // className="h-auto aspect-[10/9] w-full object-contain max-h-screen"
          />
          // </>

          
          // </div>
          
        ))}
      </div>}
      </>
      
      
    )
}

export default TeacherView

 {/* <div className="w-full h-full grid grid-cols-4 gap-4 gap-y-8">
          {Object.values(reactivePeer as PeerState)
            .filter((peer) => !!peer.stream)
            .map((peer, key) => {
              if (role === "Teacher" && peer.role === "Student") {
                return (
                  <div
                    key={"other-video-frame" + key}
                    id={"other-video-frame" + key}
                    className="min-w-[200px] bg-black relative border-4 h-52 lg:h-full flex justify-center 2xl:h-full"
                  >
                    <VideoPlayer
                      id={"other-video-" + key}
                      stream={peer.stream}
                      mute={peer.mute}
                      onClick={() =>
                        copyVideoSource(peer.stream, "others", key)
                      }
                    />
                  </div>
                );
              }
            })}
        </div> */}