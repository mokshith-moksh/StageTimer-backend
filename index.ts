import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import { RoomManager } from "./RoomManager";
import { nanoid } from "nanoid";
import { clerkClient, requireAuth, getAuth } from "@clerk/express";

const app = express();
const httpServer = createServer(app);
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: ["*"],
  },
});
const roomManager = RoomManager.getInstance();
roomManager.initialize(io);

app.get("/", (req, res) => {
  res.send("Welcome to the Video Call Server");
});

app.post("/create-room", requireAuth(), async (req, res) => {
  const { adminId } = req.body;
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (userId !== adminId) {
    return res
      .status(403)
      .json({ error: "You are not authorized to create this room" });
  }
  if (!adminId) {
    return res.status(400).json({ error: "Admin ID is required" });
  }
  const user = await clerkClient.users.getUser(userId);
  console.log(user);
  const roomId = nanoid(10);
  try {
    const room = roomManager.createRoom(
      roomId,
      adminId,
      req.protocol + "://" + req.get("host")
    );
    console.log("room Details", room);
    return res.status(201).json({
      roomId,
      url: `${req.protocol}://${req.get("host")}/room/${roomId}`,
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
