"use client";

import {
  type ReactNode,
  createContext,
  useRef,
  useContext,
  useEffect,
} from "react";
import { useStore } from "zustand";
import { createUserStore, initUserStore, UserStore } from "@/stores/user-store";
import { useParams, useSearchParams } from "next/navigation";
import { getAuthRooms, me } from "@/apis/auth";

export type UserStoreApi = ReturnType<typeof createUserStore>;

export const UserStoreContext = createContext<UserStoreApi | undefined>(
  undefined
);

export interface UserStoreProviderProps {
  children: ReactNode;
}

export const UserStoreProvider = ({ children }: UserStoreProviderProps) => {
  const storeRef = useRef<UserStoreApi | null>(null);
  const searchParams = useSearchParams();
  const { roomId } = useParams();

  if (storeRef.current === null) {
    storeRef.current = createUserStore(initUserStore());
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
        userData.roles.forEach((role) => {
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
      userData.live_role = live_role;
      setUserData(userData);
      setHasToken(true);
    } catch {
      setHasToken(false);
    }
    setIsUserLoading(false);
    return;
  };

  const handleRoomAccess = async (token: string, roomId: string) => {
    const { setHasRoomAccess, setIsRoomLoading } = storeRef.current!.getState();
    setIsRoomLoading(true);
    try {
      const rooms = await getAuthRooms(token);
      // console.log(rooms,"rooms")
      const hasAccess = rooms.find((room) => room.meeting_id === roomId);
      setHasRoomAccess(hasAccess !== undefined);
    } catch {
      setHasRoomAccess(false);
    }
    setIsRoomLoading(false);
    return;
  };

  useEffect(() => {
    initApp();
    const { setRoomId } = storeRef.current!.getState();

    const token = searchParams.get("token");

    if (roomId) setRoomId(roomId as string);

    if (token) {
      getUserData(token);
      if (roomId) handleRoomAccess(token, roomId as string);
    }
  }, [searchParams, roomId]);

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
