import express from "express";
import { createElearning, getElearnings } from "../controllers/elearning";

const router = express.Router();

router.get("/api/elearnings",getElearnings)

router.post("/api/elearnings",createElearning)


export default router