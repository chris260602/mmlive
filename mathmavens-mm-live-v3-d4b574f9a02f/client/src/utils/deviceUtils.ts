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


export const getAllUserVideoInput = async () =>{
  try {
    const devices = await getUserVideoDevices() as REMOTE_STREAM_TYPE[];
    // setVideoDevices(devices);
    // // Set the first device as the default selection if it exists
    // if (devices.length > 0) {
    //   setSelectedDevice(devices[0].deviceId);
    // }
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
  userData:object
}