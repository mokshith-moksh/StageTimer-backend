import { Router } from "express";
import { createRoom } from "../controllers/roomController";
import { requireAuth } from "@clerk/express";

const router = Router();

router.post("/create-room", requireAuth(), createRoom);

export default router;
