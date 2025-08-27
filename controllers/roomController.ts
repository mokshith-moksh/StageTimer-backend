import type { Response, Request } from "express";
import { nanoid } from "nanoid";
import { roomManager } from "..";

export const createRoom = async (req: Request, res: Response) => {
  const { adminId } = req.body;
  console.log("admin", adminId);
  if (!adminId) {
    console.error("adminId is missing in the create room section");
    res.status(500).json({ error: "The adminID was not send" });
  }
  const roomId = nanoid(10);
  try {
    try {
      const room = roomManager.createRoom(
        roomId,
        adminId,
        `${req.protocol}://${req.get("host")}`
      );
      console.log("created the room ", room);
      return res.status(201).json({
        roomId,
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to create room" });
    }
  } catch (error) {
    console.error("Error while creating the room ");
    res.status(500).json({ error: "Failed to Create a Room" });
  }
};
