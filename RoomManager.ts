import { RoomModel } from "./model/Room";
import { Room } from "./Room";
import { Server } from "socket.io";

export class RoomManager {
  private static instance: RoomManager;
  private rooms: Map<string, Room> = new Map();
  private io!: Server;

  // Only rooms with active timers
  private activeRooms: Set<Room> = new Set();

  private constructor() {}

  public static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  public initialize(io: Server) {
    this.io = io;

    // Tick only active rooms every second
    setInterval(() => {
      const now = Date.now();
      for (const room of this.activeRooms) {
        room.tickTimers(now);
      }
    }, 1000);
  }

  public async createRoom(roomId: string, adminId: string): Promise<Room> {
    let roomDoc = await RoomModel.findOne({ roomId });
    console.log("Inside the createRoom model class , checkingg .....", roomDoc);
    if (!roomDoc) {
      roomDoc = await RoomModel.create({
        roomId,
        adminId, // clerkId
        roomName: "Unnamed",
        displayName: { text: "", styles: { color: "#00FF00", bold: false } },
        timers: [],
        names: [],
        flickering: null,
      });
    }

    const room = new Room(
      roomDoc.roomId,
      roomDoc.adminId,
      this.io,
      roomDoc.roomName,
      roomDoc.toObject() // pass all DB data for initialization
    );
    this.rooms.set(roomId, room);
    return room;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public deleteRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      this.activeRooms.delete(room);
    }
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

  public markRoomActive(room: Room) {
    this.activeRooms.add(room);
  }

  public markRoomInactive(room: Room) {
    this.activeRooms.delete(room);
  }

  public getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  public getAllRoomsDB() {
    const rooms = Array.from(this.rooms.values()).map((room) => {
      const clientSocketIds = room["clientSocketIds"] as Map<string, string>;

      return {
        roomId: room["roomId"],
        adminId: room["adminId"],
        adminSocketId: (room as any).adminSocketId,
        clientSocketIds: Object.fromEntries(clientSocketIds ?? []), // 🔥 converts Map -> object
        timers: (room as any).timers ?? [],
        disPlayName: (room as any).disPlayName,
        names: (room as any).names ?? [],
        flickering: (room as any).flickering,
      };
    });

    return rooms;
  }
}
