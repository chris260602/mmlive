import { Router, Request, Response } from "express";
import { localRouters } from "../mediasoup";
import { workers } from "../mediasoup";
import { scanRedisKeys } from "../redis";
// import { getWorkers, getRooms } from "../mediasoup/worker";

const router = Router();

router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const rooms = await scanRedisKeys("room:*");
    const peers = await scanRedisKeys("peer:*:userData");
    const producers = await scanRedisKeys("producer:*:peer");
    res.json({
      workers: workers.length,
      rooms: rooms.length / 2,
      peers: peers.length, // Each peer has 2 keys (room + userData)
      producers: producers.length,
      localRouters: localRouters.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

export default router;

