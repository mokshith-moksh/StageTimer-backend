import { createServer } from "http";
import express from "express";
import { Server, Socket } from "socket.io";
import { RoomManager } from "./RoomManager";
import cors from "cors";
import dotenv from "dotenv";
import { clerkMiddleware } from "@clerk/express";
import connectDB from "./lib/db";
import userRoutes from "./routes/userRoutes";
import roomRouter from "./routes/roomRoutes";
import type { MessageUpdates } from "./Room";

dotenv.config();

const app = express();
app.use(clerkMiddleware());
app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
connectDB();

export const roomManager = RoomManager.getInstance();
roomManager.initialize(io);

app.get("/get-server-state", (req, res) => {
  const rooms = roomManager.getAllRoomsDB();
  res.send(JSON.stringify(rooms));
});

app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRouter);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join-room-socket", ({ roomId, name, role }) => {
    const room = roomManager.getRoom(roomId);
    if (!room)
      return socket.emit("error", { message: "Refresh the page to connect" });
    room.addClient(socket.id, name, role);
    socket.join(roomId);
    const roomState = room.getState();
    io.to(room.roomId).emit("roomState", { roomState });
  });

  socket.on("add-timer", ({ roomId, duration, name }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      name = "Custom Timer";
    }

    if (typeof duration !== "number" || duration <= 0) {
      return socket.emit("error", { message: "Invalid duration" });
    }

    const timer = room.addTimer(duration, name);
    console.log("timer", timer);
  });

  socket.on("start-timer", ({ roomId, timerId, adminId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    try {
      room.startTimer(timerId);
      const roomState = room.getState();
      io.to(room.roomId).emit("roomState", { roomState });
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  socket.on("pause-timer", ({ roomId, timerId, adminId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.pauseTimer(timerId);
    const roomState = room.getState();
    io.to(room.roomId).emit("roomState", { roomState });
  });

  socket.on("reset-timer", ({ roomId, timerId, adminId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.resetTimer(timerId);
    const roomState = room.getState();
    io.to(room.roomId).emit("roomState", { roomState });
  });

  socket.on("restart-timer", ({ roomId, timerId, adminId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.restartTimer(timerId);
    const roomState = room.getState();
    io.to(room.roomId).emit("roomState", { roomState });
  });

  socket.on("delete-timer", ({ roomId, timerId, adminId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.deleteTimer(timerId);
    const roomState = room.getState();
    io.to(room.roomId).emit("roomState", { roomState });
  });

  socket.on("setTimerTime", ({ roomId, timerId, newTime, adminId }) => {
    const room = roomManager.getRoom(roomId);
    if (room && room.isAdminOnline()) {
      room.setTimerTime(timerId, newTime);
    }
  });

  socket.on("createMsg", ({ roomId, adminId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      console.error("Room is not present for creating Msg");
      return socket.emit("error", {
        message: "Room is not present for creaing Msg",
      });
    }
    console.log("room msg creation started");
    room.createMessage(socket);
  });

  socket.on("getMsg", ({ roomId, adminId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      console.error("Room is not present for creating Msg");
      return socket.emit("error", {
        message: "Room is not present for creaing Msg",
      });
    }
    room.getMessages(socket);
  });

  socket.on(
    "updateMsg",
    ({
      roomId,
      messageId,
      updates,
    }: {
      roomId: string;
      messageId: string;
      updates: MessageUpdates;
    }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        console.error("Room is not present for creating Msg");
        return socket.emit("error", {
          message: "Room is not present for creaing Msg",
        });
      }
      room.updateMessage(messageId, updates, socket);
    }
  );

  socket.on("deleteMsg", ({ roomId, adminId, messageId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      console.error("Room is not present for creating Msg");
      return socket.emit("error", {
        message: "Room is not present for creaing Msg",
      });
    }
    room.deleteMessage(messageId, socket);
  });

  socket.on("toggleActive", ({ roomId, adminId, messageId }) => {
    const room = roomManager.getRoom(roomId);
    console.log(roomId, "RoomId");
    if (!room) {
      console.error("Room is not present for creating Msg");
      return socket.emit("error", {
        message: "Room is not present for creaing Msg",
      });
    }
    if (room.adminId != adminId) {
      console.error("Unauthorized access");
      socket.emit("error", { message: "Unauthorized access" });
    }
    console.log("Reached toggle ");
    room.toggleActiveMessage(messageId);
  });

  socket.on("disconnect", () => {
    for (const room of roomManager.getAllRooms()) {
      room.removeClient(socket.id);
      io.to(room.roomId).emit("roomState", { roomState: room.getState() });
    }
    console.log("Client disconnected:", socket.id);
    roomManager.cleanupEmptyRooms();
  });
});

httpServer.listen(8080, () => {
  console.log("Server is running on port 8080");
});
