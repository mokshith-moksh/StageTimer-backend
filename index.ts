import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import { RoomManager } from "./RoomManager";
import { nanoid } from "nanoid";
import cors from "cors";
import dotenv from "dotenv";
import { clerkMiddleware } from "@clerk/express";
import { requireAuth, getAuth } from "@clerk/express";

dotenv.config();

const app = express();
app.use(clerkMiddleware());
const httpServer = createServer(app);
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:3000"],
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
    const room = roomManager.createRoom(
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

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(8080, () => {
  console.log("Server is running on port 8080");
});
