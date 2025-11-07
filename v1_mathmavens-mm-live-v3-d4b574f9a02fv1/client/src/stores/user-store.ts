import { ROOM_TYPE } from "@/types/room";
import { USER_DATA_TYPE } from "@/types/user";
import { createStore } from "zustand/vanilla";
export type UserState = {
  peerId:string;
  userData?:USER_DATA_TYPE
  roomId:string;
  hasToken:boolean;
  hasRoomAccess:boolean;
  isUserLoading:boolean;
  isRoomLoading:boolean;
  isConnected: boolean;
  isRoomJoined: boolean;
  selectedDevice: string;
  roomData:ROOM_TYPE;
};

export type UserActions = {
  setPeerId: (id:string) => void;
  setUserData:(userData:USER_DATA_TYPE) =>void;
  setHasRoomAccess: (status: boolean) => void;
  setHasToken: (status: boolean) => void;
  setIsConnected: (status: boolean) => void;
  setIsUserLoading: (status: boolean) => void;
  setIsRoomLoading: (status: boolean) => void;
  setRoomId: (roomId: string) => void;
  setRoomData: (roomData:ROOM_TYPE) => void;
};

export type UserStore = UserState & UserActions;

export const initUserStore = (): UserState => {
  return {
    peerId:"",
    roomId:"",
    hasToken:false,
    hasRoomAccess:false,
    isUserLoading:false,
    isRoomLoading:false,
    isConnected: true,
    isRoomJoined: false,
    selectedDevice: "",
    roomData:{} as ROOM_TYPE

  };
};

export const defaultInitState: UserState = {
  peerId:"",
  roomId:"",
  hasToken:false,
    hasRoomAccess:false,
    isUserLoading:false,
    isRoomLoading:false,
  isConnected: true,
  isRoomJoined: false,
  selectedDevice: "",
  roomData:{} as ROOM_TYPE

};

export const createUserStore = (
  initState: UserState = defaultInitState
) => {
  return createStore<UserStore>()((set, get) => {
    

    return {
      ...initState,
      setPeerId:(id) => set({ peerId: id }),
      setHasRoomAccess: (status) => set({ hasRoomAccess: status }),
      setRoomId: (roomId) => set({ roomId: roomId }),
      setIsConnected: (status) => set({ isConnected: status }),
      setHasToken: (status) => set({ hasToken: status }),
      setIsUserLoading: (status) => set({ isUserLoading: status }),
      setIsRoomLoading: (status) => set({ isRoomLoading: status }),
      setUserData: (data) => set({ userData: data }),
      setRoomData: (data) => set({ roomData: data }),
    };
  });
};
