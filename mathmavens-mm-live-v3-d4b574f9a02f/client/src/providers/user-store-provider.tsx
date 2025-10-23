"use client";
import { v4 as uuidv4 } from 'uuid';
import {
  type ReactNode,
  createContext,
  useRef,
  useContext,
  useEffect,
} from "react";
import { StoreApi, useStore } from "zustand";
import { createUserStore, initUserStore, UserState, UserStore } from "@/stores/user-store";
import { useParams, useSearchParams } from "next/navigation";
import { getAuthRooms, me } from "@/apis/auth";
import * as Sentry from "@sentry/nextjs";

export type UserStoreApi = ReturnType<typeof createUserStore>;

export const UserStoreContext = createContext<UserStoreApi | undefined>(
  undefined
);

export interface UserStoreProviderProps {
  children: ReactNode;
  initialState?: Partial<UserState>; 
}

// export const userStore = createUserStore(initUserStore());

// export const UserStoreContext = createContext<StoreApi<UserStore> | undefined>(
//   undefined
// );


export const UserStoreProvider = ({ children, initialState }: UserStoreProviderProps) => {
  const storeRef = useRef<UserStoreApi | null>(null);
  const searchParams = useSearchParams();
  const { roomId } = useParams();

  // if (storeRef.current === null) {
  //   storeRef.current = createUserStore(initUserStore());
  // }

  if (!storeRef.current) {
    // Initialize the store. If initialState from SSR is provided, merge it with the default.
    storeRef.current = createUserStore({ ...initUserStore(), ...initialState });
  }

  const initApp = async () => {};
  const getUserData = async (token: string) => {
    const { setHasToken, setIsUserLoading, setUserData } =
      storeRef.current!.getState();
    setIsUserLoading(true);
    try {
      let live_role = "Student";
      const userData = await me(token);
      if (userData?.roles) {
        userData.roles.forEach((role:string) => {
          if (role === "Admin") {
            live_role = "Admin";
            return;
          }
          if (role === "Teacher") {
            live_role = "Teacher";
            return;
          }
          if (role === "Senior Teacher") {
            live_role = "Teacher";
            return;
          }
        });
      }
      userData!.live_role = live_role;
      console.log(userData,"usdata")
      setUserData(userData!);
      Sentry.setUser({
        id:userData?.id,
        child_id:userData?.child_id || "0",
        name: userData?.child_name || (userData?.name),
        role:userData?.live_role
      })
      setHasToken(true);
    } catch {
      setHasToken(false);
    }
    setIsUserLoading(false);
    return;
  };

  const handleRoomAccess = async (token: string, roomId: string) => {
    const { setHasRoomAccess, setIsRoomLoading,setRoomData } =  storeRef.current!.getState();
    setIsRoomLoading(true);
    try {
      const rooms = await getAuthRooms(token);
      console.log(rooms,"rooms")
      const hasAccess = rooms.find((room) => room.meeting_id === roomId);
      setRoomData(hasAccess!)
      setHasRoomAccess(hasAccess !== undefined);
    } catch {
      setHasRoomAccess(false);
    }
    setIsRoomLoading(false);
    return;
  };


  useEffect(() => {
    initApp();
    const { setRoomId } =  storeRef.current!.getState();

    const token = searchParams.get("token");

    if (roomId) setRoomId(roomId as string);

    if (token) {
      getUserData(token);
      if (roomId) handleRoomAccess(token, roomId as string);
    }
  }, [searchParams, roomId]);

  useEffect(() => {
    // We only want this to run once on startup, so we use an empty dependency array.
    
    const { setPeerId } =  storeRef.current!.getState(); // Get the setter function from your store
    
    let storedPeerId = sessionStorage.getItem('peerId');

    // Check if a peerId already exists in storage
    if (!storedPeerId) {
        // If it doesn't exist, create a new one
        storedPeerId = uuidv4();
        // And save the new ID to sessionStorage for future visits
        sessionStorage.setItem("peerId", storedPeerId);
        console.log("No peerId found in sessionStorage. Created a new one.");
    } else {
        console.log(`Found existing peerId in sessionStorage: ${storedPeerId}`);
    }

    // Finally, update your application's state (Zustand store) with the correct peerId.
    setPeerId(storedPeerId);

}, []);


  return (
    <UserStoreContext.Provider value={storeRef.current}>
      {children}
    </UserStoreContext.Provider>
  );
};

export const useUserStore = <T,>(selector: (store: UserStore) => T): T => {
  const userStoreContext = useContext(UserStoreContext);

  if (!userStoreContext) {
    throw new Error(`useUserStore must be used within UserStoreProvider`);
  }

  return useStore(userStoreContext, selector);
};
