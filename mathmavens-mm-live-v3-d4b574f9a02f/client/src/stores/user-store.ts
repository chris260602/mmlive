import { createStore } from "zustand/vanilla";
export type UserState = {
  userData?:object
  roomId:string;
  hasToken:boolean;
  hasRoomAccess:boolean;
  isUserLoading:boolean;
  isRoomLoading:boolean;
  isConnected: boolean;
  isRoomJoined: boolean;
  selectedDevice: string;
};

export type UserActions = {
  setUserData:(userData:object) =>void;
  setHasRoomAccess: (status: boolean) => void;
  setHasToken: (status: boolean) => void;
  setIsConnected: (status: boolean) => void;
  setIsUserLoading: (status: boolean) => void;
  setIsRoomLoading: (status: boolean) => void;
  setRoomId: (roomId: string) => void;
};

export type UserStore = UserState & UserActions;

export const initUserStore = (): UserState => {
  return {
    roomId:"",
    hasToken:false,
    hasRoomAccess:false,
    isUserLoading:false,
    isRoomLoading:false,
    isConnected: true,
    isRoomJoined: false,
    selectedDevice: "",

  };
};

export const defaultInitState: UserState = {
  roomId:"",
  hasToken:false,
    hasRoomAccess:false,
    isUserLoading:false,
    isRoomLoading:false,
  isConnected: true,
  isRoomJoined: false,
  selectedDevice: "",
};

export const createUserStore = (
  initState: UserState = defaultInitState
) => {
  return createStore<UserStore>()((set, get) => {
    

    return {
      ...initState,
      setHasRoomAccess: (status) => set({ hasRoomAccess: status }),
      setRoomId: (roomId) => set({ roomId: roomId }),
      setIsConnected: (status) => set({ isConnected: status }),
      setHasToken: (status) => set({ hasToken: status }),
      setIsUserLoading: (status) => set({ isUserLoading: status }),
      setIsRoomLoading: (status) => set({ isRoomLoading: status }),
      setUserData: (data) => set({ userData: data }),
    };
  });
};
