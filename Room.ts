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
  markers: number[];
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
      markers: this.generateProfessionalMarkers(duration),
    };

    this.timers.push(timer);
    this.io.to(this.roomId).emit("timer-added", timer);
    return timer;
  }

  private generateProfessionalMarkers(duration: number): number[] {
    if (duration <= 0) return [];

    const markers = new Set<number>();
    const MIN_MARKERS = 5;
    const MAX_MARKERS = 15;
    const COUNTDOWN_START = 10;

    const logDuration = Math.log10(duration);
    let baseInterval = Math.pow(10, Math.floor(logDuration) - 1);

    if (baseInterval > 60) baseInterval = 60 * Math.round(baseInterval / 60);
    baseInterval = this.nearestHumanInterval(baseInterval);

    for (
      let t = baseInterval;
      t < duration - COUNTDOWN_START;
      t += baseInterval
    ) {
      markers.add(t);
    }

    const fractions = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
    fractions.forEach((frac) => {
      const marker = Math.round(duration * frac);
      if (marker > 0 && marker < duration) markers.add(marker);
    });

    if (duration > COUNTDOWN_START) {
      for (let t = Math.max(0, duration - COUNTDOWN_START); t < duration; t++) {
        markers.add(t);
      }
    } else {
      for (let t = 1; t < duration; t++) markers.add(t);
    }

    const currentCount = markers.size;
    if (currentCount < MIN_MARKERS && baseInterval > 1) {
      const secondaryInterval = Math.max(1, Math.floor(baseInterval / 2));
      for (let t = secondaryInterval; t < duration; t += secondaryInterval) {
        if (t % baseInterval !== 0) markers.add(t);
        if (markers.size >= MIN_MARKERS) break;
      }
    } else if (currentCount > MAX_MARKERS) {
      const sorted = Array.from(markers).sort((a, b) => a - b);
      const important = new Set(
        sorted.filter(
          (t) =>
            t >= duration - COUNTDOWN_START ||
            fractions.some((f) => Math.abs(t - duration * f) < baseInterval / 2)
        )
      );
      const keepInterval = Math.ceil(sorted.length / MAX_MARKERS);
      sorted.forEach((t, i) => {
        if (important.has(t) || i % keepInterval === 0) return;
        markers.delete(t);
      });
    }

    return Array.from(markers).sort((a, b) => a - b);
  }

  private nearestHumanInterval(seconds: number): number {
    const intervals = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800];
    return intervals.reduce((prev, curr) =>
      Math.abs(curr - seconds) < Math.abs(prev - seconds) ? curr : prev
    );
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
      // Pause without emitting events to avoid UI flicker
      timer.isRunning = false;
      RoomManager.getInstance().markRoomInactive(this);
    }

    const now = Date.now();
    const elapsed = timer.duration - newTime;
    timer.startTime = now - elapsed * 1000;
    timer.pausedAt = undefined;

    if (wasRunning) {
      // Restart without emitting duplicate events
      timer.isRunning = true;
      RoomManager.getInstance().markRoomActive(this);
      // Force an immediate tick update
      this.tickTimers(now);
    }

    const remaining = this.getRemainingTime(timer);
    this.io.to(this.roomId).emit("timerTimeAdjusted", {
      timerId,
      remaining,
      isRunning: timer.isRunning, // Include current running state
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
