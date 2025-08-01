import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import { RoomManager } from "./RoomManager";
import { nanoid } from "nanoid";
import cors from "cors";
import dotenv from "dotenv";
import { clerkMiddleware, requireAuth, getAuth } from "@clerk/express";
import { Room } from "./Room";

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
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const roomManager = RoomManager.getInstance();
roomManager.initialize(io);

app.get("/", (req, res) => {
  res.send("Welcome to the Video Call Server");
});

app.post("/create-room", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  const { adminId } = req.body;

  const roomId = nanoid(10);
  try {
    const room: Room = roomManager.createRoom(
      roomId,
      adminId,
      `${req.protocol}://${req.get("host")}`
    );
    return res.status(201).json({
      roomId,
      url: `${req.protocol}://${req.get("host")}/controller/${roomId}`,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create room" });
  }
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join-room", ({ roomId, role }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return socket.emit("error", { message: "Room not found" });

    room.addClient(socket.id, role);
    socket.join(roomId);
    const roomState = room.getState();
    socket.emit("room-joined", roomState);

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
    io.to(room.roomId).emit("timer-added", timer);
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

  socket.on("disconnect", () => {
    for (const room of roomManager.getAllRooms()) {
      room.removeClient(socket.id);
      io.to(room.roomId).emit("roomState", { roomState: room.getState() });
    }
    roomManager.cleanupEmptyRooms();
  });
});

httpServer.listen(8080, () => {
  console.log("Server is running on port 8080");
});
