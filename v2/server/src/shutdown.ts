import { bullConnection, roomJoinQueue, roomJoinQueueEvents, transportQueue, transportQueueEvents } from "./bullmq";
import logger from "./logger";
import { redis, subscriber } from "./redis";
import { types as mediasoupTypes } from "mediasoup";
import { Worker } from "bullmq";

let isShuttingDown = false;
type GRACEFUL_SHUTDOWN_TYPE = {
    signal:string;
    io:any;
    server:any;
    roomJoinWorker:Worker;
    transportWorker:Worker;
    workers:mediasoupTypes.Worker<mediasoupTypes.AppData>[];
}
export const gracefulShutdown = async ({signal,io,server,roomJoinWorker,transportWorker,workers}:GRACEFUL_SHUTDOWN_TYPE) => {
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress, forcing exit...");
    process.exit(1);
  }

  isShuttingDown = true;
  logger.warn(`Received ${signal}, shutting down gracefully...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timeout, forcing exit");
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // 1. Stop accepting new Socket.IO connections
    io.close(() => {
      logger.info("Socket.IO server closed");
    });

    // 2. Pause queues (stop accepting new jobs)
    logger.info("Closing queues...");
    await Promise.all([roomJoinQueue.close(), transportQueue.close()]);
    logger.info("✅ Queues closed");

    // 3. Wait for active jobs to complete (with timeout)
    logger.info("Waiting for active jobs to complete...");
    const maxWait = 20000; // 20 seconds
    const startWait = Date.now();

    while (Date.now() - startWait < maxWait) {
      const [roomJoinCounts, transportCounts] = await Promise.all([
        roomJoinQueue.getJobCounts(),
        transportQueue.getJobCounts(),
      ]);

      if (roomJoinCounts.active === 0 && transportCounts.active === 0) {
        logger.info("✅ All active jobs completed");
        break;
      }

      logger.info("Waiting for jobs...", {
        roomJoinActive: roomJoinCounts.active,
        transportActive: transportCounts.active,
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 4. Close workers gracefully
    logger.info("Closing workers...");
    if (roomJoinWorker) {
      await roomJoinWorker.close();
      logger.info("✅ Room join worker closed");
    }
    if (transportWorker) {
      await transportWorker.close();
      logger.info("✅ Transport worker closed");
    }

    // 5. Close queue events
    logger.info("Closing queue events...");
    await transportQueueEvents.close();
    await roomJoinQueueEvents.close();
    logger.info("✅ Queue events closed");

    // 6. Close queues (this also cleans up Redis worker registrations)
    logger.info("Closing queues...");
    await roomJoinQueue.close();
    await transportQueue.close();
    logger.info("✅ Queues closed");

    // 7. Close mediasoup workers
    logger.info("Closing mediasoup workers...");
    await Promise.all(workers.map((w) => w.close()));
    logger.info("✅ Mediasoup workers closed");

    // 8. Close Redis connections
    logger.info("Closing Redis connections...");
    await redis.quit();
    await subscriber.quit();
    await bullConnection.quit();
    logger.info("✅ Redis connections closed");

    clearTimeout(shutdownTimeout);

    // 9. Close HTTP server
    server.close(() => {
      logger.info("✅ HTTP server closed");
      logger.info("🎉 Graceful shutdown completed successfully");
      process.exit(0);
    });

    // Force close after 5 seconds
    setTimeout(() => {
      logger.warn("Forcing server close");
      process.exit(0);
    }, 5000);
  } catch (error) {
    logger.error("Error during graceful shutdown", { error });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};