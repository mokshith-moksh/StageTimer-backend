import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import { RoomManager } from "./RoomManager";
import { nanoid } from "nanoid";
import cors from "cors";
import dotenv from "dotenv";
import { clerkMiddleware } from "@clerk/express";
import { requireAuth, getAuth } from "@clerk/express";
import { Room } from "./Room";
dotenv.config();

const app = express();
app.use(clerkMiddleware());
const httpServer = createServer(app);
app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

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
  console.log("Creating room with body:", req.body);
  const { userId } = getAuth(req);
  console.log("Authenticated user ID:", userId);
  const { adminId } = req.body;

  const roomId = nanoid(10);
  try {
    const room: Room = roomManager.createRoom(
      roomId,
      adminId,
      req.protocol + "://" + req.get("host")
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
    if (!room) {
      return socket.emit("error", { message: "Room not found" });
    }

    room.addClient(socket.id, role);
    socket.join(roomId);
    socket.emit("room-joined", room.getState());

    const roomState = room.getState();
    if (room.isAdminOnline()) {
      io.to(room.roomId).emit("RoomState", { roomState });
    }
  });
  socket.on("add-timer", ({ roomId, duration, name }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      return socket.emit("error", { message: "Room not found" });
    }
    if (name.length == 0) {
      name = "Custom Timer";
    }
    // need to add the security for timer and name - REMEMBER PLZ

    const timer = room.addTimer(duration, name);
    io.to(room.roomId).emit("timer-added", timer);
  });
  socket.on("start-timer", ({ roomId, timerId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      return socket.emit("error", { message: "Room not found" });
    }

    try {
      room.startTimer(timerId); // ← this triggers setInterval and emits timerTick
      io.to(room.roomId).emit("timer-started", { timerId });
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  socket.on("disconnect", () => {
    for (const room of roomManager.getAllRooms()) {
      room.removeClient(socket.id);

      if (room.isAdminOnline()) {
        const count = room.getConnectedClientCount();
        io.to(room.roomId).emit("connected-client-count", { count });
      }
    }
    roomManager.cleanupEmptyRooms();
  });
});

httpServer.listen(8080, () => {
  console.log("Server is running on port 8080");
});
