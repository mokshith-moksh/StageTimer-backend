// Room.ts

import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
type Timer = {
  id: string;
  name: string;
  duration: number;
  startTime?: number;
  isRunning: boolean;
};

export class Room {
  readonly roomId: string;
  readonly adminId: string;

  private adminSocketId: string | null = null;
  private clientSocketIds: Set<string> = new Set();

  private timers: Timer[] = [];
  private currentTimerId: string | null = null;
  private timerInterval: NodeJS.Timeout | null = null;

  private io: Server;

  constructor(roomId: string, adminId: string, baseUrl: string, io: Server) {
    this.roomId = roomId;
    this.adminId = adminId;
    this.io = io;
  }

  // === CONNECTION TRACKING ===

  public addClient(socketId: string, role: "admin" | "client") {
    if (role === "admin") {
      this.adminSocketId = socketId;
    } else {
      this.clientSocketIds.add(socketId);
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

  public addTimer(duration: number, name: string) {
    const timer: Timer = {
      id: uuidv4(),
      name,
      duration,
      isRunning: false,
    };
    this.timers.push(timer);
    return timer;
  }

  public deleteTimer(timerId: string) {
    this.timers = this.timers.filter((t) => t.id !== timerId);
    if (this.currentTimerId === timerId) {
      this.currentTimerId = null;
    }
  }

  public startTimer(timerId: string) {
    const timer = this.timers.find((t) => t.id === timerId);
    if (!timer) throw new Error("Timer not found");

    timer.startTime = Date.now();
    timer.isRunning = true;
    this.currentTimerId = timerId;

    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (timer.startTime ?? 0)) / 1000);
      const remaining = Math.max(0, timer.duration - elapsed);

      this.io.to(this.roomId).emit("timerTick", {
        timerId,
        remaining,
        total: timer.duration,
      });

      if (remaining <= 0) {
        this.stopCurrentTimer();
        this.io.to(this.roomId).emit("timerEnded", { timerId });
      }
    }, 1000);
  }

  public stopCurrentTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const timer = this.timers.find((t) => t.id === this.currentTimerId);
    if (timer) timer.isRunning = false;

    this.currentTimerId = null;
    this.timerInterval = null;
  }

  // === STATE ===

  public getState() {
    return {
      roomId: this.roomId,
      adminId: this.adminId,
      adminOnline: this.isAdminOnline(),
      clientCount: this.getConnectedClientCount(),
      timers: this.timers,
      currentTimerId: this.currentTimerId,
    };
  }
}
