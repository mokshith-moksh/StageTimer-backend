// RoomManager.ts

import { Room } from "./Room";
import { Server } from "socket.io";

export class RoomManager {
  private static instance: RoomManager;
  private rooms: Map<string, Room> = new Map();
  private io!: Server;

  private constructor() {}

  public static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  public initialize(io: Server) {
    this.io = io;
  }

  public createRoom(roomId: string, adminId: string, baseUrl: string): Room {
    if (this.rooms.has(roomId)) {
      throw new Error(`Room ${roomId} already exists`);
    }

    const room = new Room(roomId, adminId, baseUrl, this.io);
    this.rooms.set(roomId, room);
    return room;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public deleteRoom(roomId: string) {
    this.rooms.delete(roomId);
  }

  public roomExists(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  public cleanupEmptyRooms() {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.isEmpty()) {
        this.deleteRoom(roomId);
      }
    }
  }

  public getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}
