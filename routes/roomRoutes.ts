import { Router } from "express";
import {
  createRoom,
  getRoomByAdminId,
  joinRoomByExistingId,
} from "../controllers/roomController";
import { requireAuth } from "@clerk/express";

const router = Router();

router.post("/create-room", requireAuth(), createRoom);
router.get("/getRooms", requireAuth(), getRoomByAdminId);
router.post("/join-room", requireAuth(), joinRoomByExistingId);
/* 
router.post("/:roomId/messages", createMessage);
router.get("/:roomId/messages", getMessages);
router.put("/:roomId/messages/:messageId", updateMessage);
router.delete("/:roomId/messages/:messageId", deleteMessage);
*/
export default router;
