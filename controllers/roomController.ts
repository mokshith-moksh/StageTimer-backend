import type { Response, Request } from "express";
import { nanoid } from "nanoid";
import { roomManager } from "..";
import { RoomModel } from "../model/Room";

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

export const getRooms = async (req: Request, res: Response) => {
  const { adminId } = req.query;
  console.log("got the admin in getRooms");
  if (!adminId)
    res.status(422).json({ error: "AdminId not sent with request " });
  try {
    console.log("adminId", adminId);
    let rooms = await RoomModel.find(
      { adminId: adminId },
      { roomId: 1, roomName: 1 }
    ).lean();
    if (!rooms) {
      res.status(404).json({ error: "Room data not found" });
    }
    console.log("Rooms", rooms);
    res.status(200).json({ rooms });
  } catch (error) {
    console.error("Error while getting the room info");
    res.status(500).json({ error: "Error while getting the room info" });
  }
};
