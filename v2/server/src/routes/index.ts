import { Router } from "express";
import healthRoutes from "./health";
import debugRoutes from "./debug";

const router = Router();

router.use(healthRoutes);
router.use(debugRoutes);

router.get("/", (req, res) => {
  res.send("MM LIVE server is running");
});

export default router;