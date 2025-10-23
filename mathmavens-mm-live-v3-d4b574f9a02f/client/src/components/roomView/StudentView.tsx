import { SettingsIcon } from "lucide-react";
import { Button } from "../ui/button";
import VideoStream from "../VideoStream";

const StudentView = ({ stream }: { stream: MediaStream }) => {
  return (
      <div className="flex">
        {/* <div className="absolute top-6 right-6 z-10">
          <Button  size="icon" className="size-12">
            <SettingsIcon className="size-6 text-white"/>
          </Button>
        </div> */}
        {stream && (
            <div key={"user"} className="absolute w-full h-full top-0 flex justify-center items-center bg-black">
            <video
              ref={(videoEl) => {
                if (videoEl) videoEl.srcObject = stream;
              }}
              autoPlay
              playsInline
              className={`h-auto aspect-[10/9] w-full object-contain max-h-screen`}
            />
            
          </div>

        )}
      </div>
  );
};

export default StudentView;
