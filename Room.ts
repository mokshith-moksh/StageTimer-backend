import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { RoomManager } from "./RoomManager";
import type { RoomDoc } from "./model/Room";

export type Timer = {
  id: string;
  name: string;
  duration: number; // total original duration (constant)
  startTime?: number;
  pausedAt?: number;
  isRunning: boolean;
};

export type DisplayNames = {
  text: string;
  styles: {
    color: string;
    bold: boolean;
  };
};

export class Room {
  readonly roomId: string;
  readonly adminId: string;
  private roomName: string = "Unnamed";
  private adminSocketId: string | null = null;
  private clientSocketIds: Map<string, string> = new Map();
  private timers: Timer[] = [];
  private disPlayName = {
    text: "",
    styles: {
      color: "#00FF00",
      bold: false,
    },
  };
  private names: DisplayNames[] = [];
  private flickering: boolean | null = null;

  private io: Server;

  constructor(
    roomId: string,
    adminId: string,
    _baseUrl: string,
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
      this.disPlayName = existingData.displayName ?? {
        text: "",
        styles: { color: "#00FF00", bold: false },
      };
      this.names = existingData.names ?? [];
      this.flickering = existingData.flickering ?? null;
    }
  }

  // === MESSAGE HANDLING ===
  // runs when Show btn is clicked
  public displayName(
    text: string,
    color: string,
    bold: boolean,
    socketId: string
  ) {
    if (socketId !== this.adminSocketId) {
      console.warn(`Unauthorized attempt to set display name by ${socketId}`);
      return;
    }
    if (!text || !color) {
      console.warn("Invalid display name parameters");
      return;
    }
    try {
      this.disPlayName = {
        text: text,
        styles: {
          color: color,
          bold: bold,
        },
      };
      console.log(`Display name set by ${socketId}:`, this.disPlayName);
      this.io.to(this.roomId).emit("displayNameUpdated", this.disPlayName);
      console.log("message sent");
    } catch (error) {
      console.error("Error setting message:", error);
      return;
    }
  }

  public setNames(names: DisplayNames[], socketId: string) {
    if (socketId !== this.adminSocketId) {
      return;
    }
    if (!Array.isArray(names) || names.length === 0) {
      return;
    }
    try {
      this.names = names.map((name) => ({
        text: name.text,
        styles: {
          color: name.styles.color,
          bold: name.styles.bold,
        },
      }));
      this.io.to(this.roomId).emit("namesUpdated", this.names);
      console.log("names updated");
    } catch (error) {
      console.error("Error updating names:", error);
      return;
    }
  }

  public updateNames(
    index: number,
    updates: Partial<DisplayNames>,
    socketId: string
  ) {
    if (socketId !== this.adminSocketId) {
      return;
    }
    this.names = this.names.map((name, i) =>
      i === index ? { ...name, ...updates } : name
    );
    console.log(`Name at index ${index} updated by ${socketId}:`, updates);
    console.log("Updated names:", this.names);
  }
  public toggleFlicker(flickering: boolean, socketId: string) {
    if (socketId !== this.adminSocketId) {
      return;
    }
    this.flickering = flickering;
    this.io.to(this.roomId).emit("flickeringToggled", this.flickering);
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
  public addTimer(duration: number, name: string) {
    const timer: Timer = {
      id: uuidv4(),
      name,
      duration,
      isRunning: false,
    };
    this.timers.push(timer);
    this.io.to(this.roomId).emit("timer-added", this.timers);
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
      displayName: this.disPlayName,
      names: this.names,
      flickering: this.flickering,
    };
  }
}
