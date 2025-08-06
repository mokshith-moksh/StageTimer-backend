import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { RoomManager } from "./RoomManager";

export type Timer = {
  id: string;
  name: string;
  duration: number; // total original duration (constant)
  startTime?: number;
  pausedAt?: number;
  isRunning: boolean;
};

export class Room {
  readonly roomId: string;
  readonly adminId: string;

  private adminSocketId: string | null = null;
  private clientSocketIds: Set<string> = new Set();
  private timers: Timer[] = [];

  private io: Server;

  constructor(roomId: string, adminId: string, _baseUrl: string, io: Server) {
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
    this.io.to(this.roomId).emit("timer-added", timer);
    return timer;
  }

  public deleteTimer(timerId: string) {
    this.pauseTimer(timerId);
    this.timers = this.timers.filter((t) => t.id !== timerId);
  }

  public startTimer(timerId: string) {
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
    this.io.to(this.roomId).emit("timerTimeAdjusted", {
      timerId,
      remaining,
      isRunning: timer.isRunning,
    });
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

  public getState() {
    const timersWithRemaining = this.timers.map((timer) => {
      const remaining = this.getRemainingTime(timer);
      return { ...timer, remaining };
    });

    return {
      roomId: this.roomId,
      adminId: this.adminId,
      adminOnline: this.isAdminOnline(),
      clientCount: this.getConnectedClientCount(),
      timers: timersWithRemaining,
    };
  }
}
