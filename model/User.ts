import mongoose, { Schema, Document } from "mongoose";

export interface UserDoc extends Document {
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    clerkId: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    firstName: { type: String },
    lastName: { type: String },
    imageUrl: { type: String },
  },
  { timestamps: true }
);
UserSchema.virtual("rooms", {
  ref: "Room",
  localField: "clerkId",
  foreignField: "adminId",
});
export const UserModel = mongoose.model<UserDoc>("User", UserSchema);
