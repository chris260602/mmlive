import { Router, Request, Response } from "express";
// import { getWorkers, getRooms } from "../mediasoup/worker";

const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    // workers: getWorkers().length,
    // rooms: getRooms().size,
    timestamp: new Date().toISOString(),
  });
});

export default router;