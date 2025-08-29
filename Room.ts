import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { RoomManager } from "./RoomManager";
import { RoomModel, type RoomDoc } from "./model/Room";
import { Socket } from "socket.io";

export type Timer = {
  id: string;
  name: string;
  duration: number; // total original duration (constant)
  startTime?: number;
  pausedAt?: number;
  isRunning: boolean;
};

export type Messages = {
  id: string;
  text: string;
  styles: {
    color: string;
    bold: boolean;
  };
};
export type MessageUpdates = Partial<{
  text: string;
  styles: {
    color: string;
    bold: boolean;
  };
}>;

export class Room {
  readonly roomId: string;
  readonly adminId: string;
  private roomName: string = "Unnamed";
  private adminSocketId: string | null = null;
  private clientSocketIds: Map<string, string> = new Map();
  private timers: Timer[] = [];
  private activeMessage: string | null = null;
  private messages: Messages[] = [];
  private io: Server;

  constructor(
    roomId: string,
    adminId: string,
    io: Server,
    roomName: string,
    existingData?: RoomDoc
  ) {
    this.roomId = roomId;
    this.adminId = adminId;
    this.io = io;
    this.roomName = roomName;

    if (existingData) {
      this.timers = existingData.timers ?? [];
      this.roomName = existingData.roomName;
    }
  }

  // === CONNECTION TRACKING ===
  public addClient(socketId: string, name: string, role: "admin" | "client") {
    if (role === "admin") {
      this.adminSocketId = socketId;
    } else {
      this.clientSocketIds.set(socketId, name);
    }
  }

  public removeClient(socketId: string) {
    if (this.adminSocketId === socketId) {
      this.adminSocketId = null;
    } else {
      this.clientSocketIds.delete(socketId);
    }
  }

  public isEmpty(): boolean {
    return !this.adminSocketId && this.clientSocketIds.size === 0;
  }

  public getConnectedClientCount(): number {
    return this.clientSocketIds.size;
  }

  public isAdminOnline(): boolean {
    return !!this.adminSocketId;
  }

  // === TIMER HANDLING ===
  public async addTimer(duration: number, name: string) {
    const timer: Timer = {
      id: uuidv4(),
      name,
      duration,
      isRunning: false,
    };

    // 1. Persist in DB first
    const updated = await RoomModel.findOneAndUpdate(
      { roomId: this.roomId },
      { $push: { timers: timer } },
      { new: true } // return updated doc
    );

    if (!updated) {
      throw new Error("Room not found while adding timer");
    }

    // 2. Sync in-memory state from DB
    this.timers.push(timer);

    // 3. Emit
    const roomState = this.getState();
    this.io.to(this.roomId).emit("roomState", { roomState });

    return timer;
  }

  public deleteTimer(timerId: string) {
    this.pauseTimer(timerId);
    this.timers = this.timers.filter((t) => t.id !== timerId);
  }

  public startTimer(timerId: string) {
    const runingTimer = this.timers.find((timer) => timer.isRunning == true);
    if (runingTimer) {
      this.pauseTimer(runingTimer.id);
    }
    const timer = this.timers.find((t) => t.id === timerId);
    if (!timer) throw new Error("Timer not found");
    if (timer.isRunning) return;

    const now = Date.now();

    if (timer.pausedAt) {
      const pausedDuration = (timer.pausedAt - (timer.startTime || 0)) / 1000;
      timer.startTime = now - pausedDuration * 1000;
      delete timer.pausedAt;
    } else {
      timer.startTime = now;
    }

    timer.isRunning = true;
    RoomManager.getInstance().markRoomActive(this);
    this.io.to(this.roomId).emit("timerStarted", { timerId });
  }

  public pauseTimer(timerId: string) {
    const timer = this.timers.find((t) => t.id === timerId);
    if (!timer || !timer.isRunning) return;

    timer.isRunning = false;
    timer.pausedAt = Date.now();

    const stillRunning = this.timers.some((t) => t.isRunning);
    if (!stillRunning) {
      RoomManager.getInstance().markRoomInactive(this);
    }

    this.io.to(this.roomId).emit("timerPaused", { timerId });
  }

  public resetTimer(timerId: string) {
    const timer = this.timers.find((t) => t.id === timerId);
    if (!timer) return;

    this.pauseTimer(timerId);
    timer.startTime = undefined;
    timer.pausedAt = undefined;
    timer.isRunning = false;

    this.io.to(this.roomId).emit("timerReset", { timerId });
  }

  public restartTimer(timerId: string) {
    const timer = this.timers.find((t) => t.id === timerId);
    if (!timer) return;

    this.resetTimer(timerId);
    this.startTimer(timerId);
  }

  private getRemainingTime(timer: Timer): number {
    if (!timer.isRunning) {
      if (timer.pausedAt && timer.startTime) {
        const pausedElapsed = (timer.pausedAt - timer.startTime) / 1000;
        return timer.duration - pausedElapsed;
      }
      return timer.duration;
    }

    if (!timer.startTime) return timer.duration;
    const elapsed = (Date.now() - timer.startTime) / 1000;
    return Math.max(0, timer.duration - elapsed);
  }

  public setTimerTime(timerId: string, newTime: number) {
    const timer = this.timers.find((t) => t.id === timerId);
    if (!timer) throw new Error("Timer not found");

    newTime = Math.max(0, Math.min(newTime, timer.duration));

    const wasRunning = timer.isRunning;
    if (wasRunning) {
      // Pause without emitting events
      timer.isRunning = false;
      RoomManager.getInstance().markRoomInactive(this);
    }

    const now = Date.now();

    if (wasRunning) {
      const elapsed = timer.duration - newTime;
      timer.startTime = now - elapsed * 1000;
      timer.pausedAt = undefined;

      // Restart without duplicate events
      timer.isRunning = true;
      RoomManager.getInstance().markRoomActive(this);
      this.tickTimers(now);
    } else {
      // Paused: update pausedAt and startTime properly
      timer.pausedAt = now;
      timer.startTime = now - (timer.duration - newTime) * 1000;
    }

    const remaining = this.getRemainingTime(timer);
    const roomState = this.getState();
    this.io.to(this.roomId).emit("roomState", { roomState });
  }

  public tickTimers(now: number) {
    const timer = this.timers.find((t) => t.isRunning);
    if (!timer) return;

    const remaining = this.getRemainingTime(timer);
    this.io.to(this.roomId).emit("timerTick", {
      timerId: timer.id,
      remaining,
      total: timer.duration,
    });
    if (remaining <= 0) {
      this.pauseTimer(timer.id);
      this.io.to(this.roomId).emit("timerEnded", { timerId: timer.id });
    }
  }

  // ============= MESSAGE CRUD =================

  /** Create a new message */
  async createMessage(socket: Socket) {
    const message: Messages = {
      id: uuidv4(),
      text: " ",
      styles: {
        bold: false,
        color: "#fffff",
      },
    };
    this.messages.push(message);
    await RoomModel.updateOne(
      { roomId: this.roomId },
      { $push: { messages: message } }
    );
    const roomState = this.getState();
    this.io.to(this.roomId).emit("roomState", { roomState });
  }

  async updateMessage(
    messageId: string,
    updates: MessageUpdates,
    socket: Socket
  ) {
    const idx = this.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return null;
    if (this.messages[idx]) {
      this.messages[idx] = { ...this.messages[idx], ...updates };
      await RoomModel.updateOne(
        { roomId: this.roomId, "messages.id": messageId },
        { $set: { "messages.$": this.messages[idx] } }
      );

      const roomState = this.getState();
      this.io.to(this.roomId).emit("roomState", { roomState });
    }
  }

  /** Delete a message */
  async deleteMessage(messageId: string, socket: Socket) {
    this.messages = this.messages.filter((m) => m.id !== messageId);
    if (this.activeMessage === messageId) {
      this.activeMessage = null;
      await RoomModel.updateOne(
        { roomId: this.roomId },
        {
          $set: { activeMessageId: null },
          $pull: { messages: { id: messageId } },
        }
      );
    } else {
      await RoomModel.updateOne(
        { roomId: this.roomId },
        { $pull: { messages: { id: messageId } } }
      );
    }
    const roomState = this.getState();
    this.io.to(this.roomId).emit("roomState", { roomState });
  }

  /** Get all messages */
  async getMessages(socket: Socket) {
    if (this.messages.length === 0) {
      const room = await RoomModel.findOne({ roomId: this.roomId });
      if (room) {
        this.messages = room.messages;
        this.activeMessage = room.activeMessageId ?? null;
      }
    }
    const roomState = this.getState();
    this.io.to(this.roomId).emit("roomState", { roomState });
  }

  /** Toggle active message */
  async toggleActiveMessage(messageId: string) {
    if (this.activeMessage === messageId) {
      this.activeMessage = null;
    } else {
      this.activeMessage = messageId;
    }

    // DB update
    await RoomModel.updateOne(
      { roomId: this.roomId },
      { $set: { activeMessageId: this.activeMessage } }
    );

    // Broadcast
    const messages = this.messages;
    this.io.to(this.roomId).emit("activeMessageUpdated", {
      activeMessageId: this.activeMessage,
      messages,
    });
  }

  public getClientsArray() {
    return Array.from(this.clientSocketIds, ([userId, socketId]) => ({
      userId,
      socketId,
    }));
  }
  public getState() {
    const timersWithRemaining = this.timers.map((timer) => {
      const remaining = this.getRemainingTime(timer);
      return { ...timer, remaining };
    });

    return {
      roomId: this.roomId,
      adminId: this.adminId,
      adminSocketId: this.adminSocketId,
      roomName: this.roomName,
      adminOnline: this.isAdminOnline(),
      clientCount: this.getConnectedClientCount(),
      connectedClients: this.getClientsArray(),
      timers: timersWithRemaining,
    };
  }
}
