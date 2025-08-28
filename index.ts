import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import { RoomManager } from "./RoomManager";
import cors from "cors";
import dotenv from "dotenv";
import { clerkMiddleware } from "@clerk/express";
import { type DisplayNames } from "./Room";
import connectDB from "./lib/db";
import userRoutes from "./routes/userRoutes";
import roomRouter from "./routes/roomRoutes";

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
app.use("/api/room", roomRouter);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join-room-socket", ({ roomId, name, role }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });
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

  socket.on("start-timer", ({ roomId, timerId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    try {
      room.startTimer(timerId);
      io.to(room.roomId).emit("timer-started", { timerId });
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  socket.on("pause-timer", ({ roomId, timerId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.pauseTimer(timerId);
    io.to(room.roomId).emit("timer-paused", { timerId });
  });

  socket.on("reset-timer", ({ roomId, timerId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.resetTimer(timerId);
    io.to(room.roomId).emit("timer-reset", { timerId });
  });

  socket.on("restart-timer", ({ roomId, timerId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.restartTimer(timerId);
    io.to(room.roomId).emit("timer-restarted", { timerId });
  });

  socket.on("delete-timer", ({ roomId, timerId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.deleteTimer(timerId);
    io.to(room.roomId).emit("timer-deleted", { timerId });
  });

  socket.on("setTimerTime", ({ roomId, timerId, newTime }) => {
    const room = roomManager.getRoom(roomId);
    if (room && room.isAdminOnline()) {
      room.setTimerTime(timerId, newTime);
    }
  });

  socket.on("setDisplayName", ({ roomId, text, color, bold }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });
    room.displayName(text, color, bold, socket.id);
  });

  socket.on(
    "setNames",
    ({ roomId, names }: { roomId: string; names: DisplayNames[] }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return socket.emit("error", { message: "Room not found" });
      room.setNames(names, socket.id);
    }
  );

  socket.on(
    "updateNames",
    ({
      roomId,
      index,
      updates,
    }: {
      roomId: string;
      index: number;
      updates: Partial<DisplayNames>;
    }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return socket.emit("error", { message: "Room not found" });
      room.updateNames(index, updates, socket.id);
    }
  );

  socket.on("toggleFlicker", ({ roomId, flickering }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });
    room.toggleFlicker(flickering, socket.id);
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
