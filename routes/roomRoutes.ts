import { Router } from "express";
import { createRoom, getRooms } from "../controllers/roomController";
import { requireAuth } from "@clerk/express";

const router = Router();

router.post("/create-room", requireAuth(), createRoom);
router.get("/getRooms", requireAuth(), getRooms);

export default router;
