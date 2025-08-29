import type { Response, Request } from "express";
import { nanoid } from "nanoid";
import { roomManager } from "..";
import { RoomModel } from "../model/Room";
import { v4 as uuidv4 } from "uuid";

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
    console.log("isPResentINMemory", isPresentInMemory);
    if (isPresentInMemory) {
      const room = roomManager.getRoom(roomId);
      const roomState = room?.getState();
      console.log("Inmemory When Join Room ", roomState);
      return res.status(200).json({ roomState });
    }
    const room = await roomManager.createRoom(roomId, adminId);
    const roomState = room.getState();
    console.log("Hydrating from the DB ", roomState);
    return res.status(200).json({ roomState: roomState });
  } catch (error) {
    console.error("Error while joing the room");
    return res.status(500).json({ error: "Error while joining the room" });
  }
};

/* 
export const createMessage = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const newMessage = {
      id: uuidv4(),
      text: "Add msg here",
      styles: {
        color: "#fffff",
        bold: false,
      },
      isLive: false,
    };

    const room = await RoomModel.findOneAndUpdate(
      { roomId },
      { $push: { messages: newMessage } },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.status(201).json(newMessage);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    const room = await RoomModel.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json(room.messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const { roomId, messageId } = req.params;

    const room = await RoomModel.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const index = room.messages.findIndex((m) => m.id === messageId);
    if (index === -1) {
      return res.status(404).json({ error: "Message not found" });
    }

    room.messages.splice(index, 1);
    await room.save();

    res.json({ success: true, messages: room.messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
export const updateMessage = async (req: Request, res: Response) => {
  try {
    const { roomId, messageId } = req.params;
    const { text, styles, isLive } = req.body;

    const room = await RoomModel.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const message = room.messages.find((m) => m.id === messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (text !== undefined) message.text = text;

    if (styles !== undefined) {
      // Validate and update styles
      if (styles.color !== undefined) message.styles.color = styles.color;
      if (styles.bold !== undefined) message.styles.bold = styles.bold;
    }
    await room.save();
    res.json(message);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
 */
