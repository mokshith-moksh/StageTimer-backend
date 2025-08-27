import mongoose, { Schema, Document } from "mongoose";

export type Timer = {
  id: string;
  name: string;
  duration: number;
  startTime?: number;
  pausedAt?: number;
  isRunning: boolean;
};

export type DisplayName = {
  text: string;
  styles: {
    color: string;
    bold: boolean;
  };
};

export interface RoomDoc extends Document {
  roomId: string;
  adminId: string;
  timers: Timer[];
  displayName: DisplayName;
  names: DisplayName[];
  flickering?: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

const TimerSchema = new Schema<Timer>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    duration: { type: Number, required: true },
    startTime: { type: Number },
    pausedAt: { type: Number },
    isRunning: { type: Boolean, required: true },
  },
  { _id: false }
);

const DisplayNameSchema = new Schema<DisplayName>(
  {
    text: { type: String, required: false, default: "" },
    styles: {
      color: { type: String, required: true },
      bold: { type: Boolean, required: true },
    },
  },
  { _id: false }
);

const RoomSchema = new Schema<RoomDoc>(
  {
    roomId: { type: String, required: true, unique: true },
    adminId: { type: String, required: true },
    timers: { type: [TimerSchema], default: [] },
    displayName: {
      type: DisplayNameSchema,
      default: { text: "", styles: { color: "#00FF00", bold: false } },
    },
    names: { type: [DisplayNameSchema], default: [] },
    flickering: { type: Boolean, default: null },
  },
  { timestamps: true }
);

export const RoomModel = mongoose.model<RoomDoc>("Room", RoomSchema);
