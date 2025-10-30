import { USER_DATA_TYPE } from "@/types/user";
import { toast } from "sonner";

export const getUserVideoDevices = async()=>{
    // let userDevices:MediaDeviceInfo[] = [];
    const devices = await navigator.mediaDevices
    .enumerateDevices();
    const userDevices = devices.filter((device) => {
        return device.kind === 'videoinput'
      });
      return userDevices;
    // .then((devices) => {
    //   userDevices = devices.filter((device) => {
    //     return device.kind === 'videoinput'
    //   });
    //   return userDevices;
    // //   console.log(userDevices,"user dvice")
    // })
    // .catch((err) => {
    //   console.error(`${err.name}: ${err.message}`);
    //   return [];

    // });
    // return userDevices;
}

export const getUserAudioDevices = async (): Promise<MediaDeviceInfo[]> => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  console.log(devices,'dev')
  return devices.filter(device => device.kind === 'audioinput');
};

export const requestMicrophonePermission = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: true,video:false 
    });
    console.log(stream,"strim")
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (err) {
    console.error("Error requesting microphone permission:", err);
    toast.error("Please give microphone permission");
    return false;
  }
};

export const getAllUserAudioInput = async (): Promise<MediaDeviceInfo[]> => {
  try {
    // await requestMicrophonePermission();
    const devices = await getUserAudioDevices();
    return devices;
  } catch (error) {
    console.error("Error fetching audio devices:", error);
    return [];
  }
};

export const requestCameraPermission = async () => {
    try {
        // Request a stream just to trigger the permission prompt.
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        // Immediately stop the tracks to release the camera, as we don't need this stream yet.
        stream.getTracks().forEach(track => track.stop());
        return true; // Indicates permission was granted
    } catch (err) {
        console.error("Error requesting camera permission:", err);
        toast.error("Please give camera permission")
        return false; // Indicates permission was denied or another error occurred
    }
};


export const getAllUserVideoInput = async () =>{
  try {
    const devices = await getUserVideoDevices() as REMOTE_STREAM_TYPE[];
    return devices;
  } catch (error) {
    console.error("Error fetching video devices:", error);
    return [];
  } finally {
    // setIsLoading(false);
  }
}






export type REMOTE_STREAM_TYPE = MediaDeviceInfo &{
  stream:MediaStream
  consumerId:string
  userData:USER_DATA_TYPE
  producerId?: string;
  kind?: string; // 'video' | 'audio'
  quality?: 'excellent' | 'good' | 'poor';
  deviceId?: string;
  label?: string;
  appData:{
  cameraType?: 'primary' | 'secondary'
  }
}