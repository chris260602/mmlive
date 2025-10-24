import logger from "./logger";
import { localRouters } from "./mediasoup";
import { redis } from "./redis";

export const getPeer = async (socketId: string) => {
  const userDataStr = await redis.get(`peer:${socketId}:userData`);
  return userDataStr ? JSON.parse(userDataStr) : null;
};

export const getRoomFromSocketId = async (socketId: string) => {
  const roomName = await redis.get(`peer:${socketId}:room`);
  if (!roomName) return { name: null, router: null };

  const routerId = await redis.hget(`room:${roomName}`, "routerId");
  if (!routerId) return { name: roomName, router: null };

  const router = localRouters.get(routerId);
  return { name: roomName, router };
};

export const findPeerByProducerId = async (producerId: string) => {
  const socketId = await redis.get(`producer:${producerId}:peer`);
  if (!socketId) return null;
  return getPeer(socketId);
};

export const getProducerInfo = async (producerId: string) => {
    const info = await redis.hgetall(`producer:${producerId}:info`);
    if (!info || !info.peerSocketId) return null;
    try {
        const peerData = await getPeer(info.peerSocketId); // Fetch full peer data
        return {
            peerSocketId: info.peerSocketId,
            appData: JSON.parse(info.appData || '{}'),
            kind: info.kind,
            peerUserData: peerData // Include full user data
        };
    } catch (e) {
        logger.error("Error parsing producer appData or fetching peer data", { producerId, error: e });
        return null;
    }
};