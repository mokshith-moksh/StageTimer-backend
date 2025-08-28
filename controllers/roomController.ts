import type { Response, Request } from "express";
import { nanoid } from "nanoid";
import { roomManager } from "..";
import { RoomModel } from "../model/Room";

export const createRoom = async (req: Request, res: Response) => {
  const { adminId } = req.body;
  if (!adminId) {
    console.error("adminId is missing in the create room section");
    return res.status(500).json({ error: "The adminID was not send" });
  }
  const roomId = nanoid(10);
  try {
    const room = await roomManager.createRoom(roomId, adminId);
    return res.status(200).json({
      roomId,
    });
  } catch (error) {
    console.error("Error while creating the room ");
    return res.status(500).json({ error: "Failed to Create a Room" });
  }
};

export const getRoomByAdminId = async (req: Request, res: Response) => {
  const { adminId } = req.query;
  if (!adminId)
    return res.status(422).json({ error: "AdminId not sent with request " });
  try {
    console.log("adminId", adminId);
    let rooms = await RoomModel.find(
      { adminId: adminId },
      { roomId: 1, roomName: 1 }
    ).lean();
    if (!rooms) {
      return res.status(404).json({ error: "Room data not found" });
    }
    console.log("Rooms", rooms);
    return res.status(200).json({ rooms });
  } catch (error) {
    console.error("Error while getting the room info");
    return res.status(500).json({ error: "Error while getting the room info" });
  }
};

export const joinRoomByExistingId = async (req: Request, res: Response) => {
  const { roomId, adminId } = req.body;
  try {
    const isPresentInMemory = roomManager.roomExists(roomId);
    if (isPresentInMemory) {
      const room = roomManager.getRoom(roomId);
      const roomState = room?.getState();
      console.log("Inmemory When Join Room ", roomState);
      return res.status(200).json({ roomState });
    }
    const room = await roomManager.createRoom(roomId, adminId);
    const roomState = room.getState();
    console.log("Hydrating from the DB ", roomState);
    res.status(200).json({ roomState: roomState });
  } catch (error) {
    console.error("Error while joing the room");
    return res.status(500).json({ error: "Error while joining the room" });
  }
};
