import type { Request, Response } from "express";
import { UserModel } from "../model/User";

export const createUser = async (req: Request, res: Response) => {
  const { clerkId, email, firstName, lastName, imageUrl } = req.body;
  console.log("CreaUSer", clerkId, email, firstName, lastName, imageUrl);
  try {
    const existingUser = await UserModel.findOne({ clerkId });
    console.log(existingUser);
    if (!existingUser) {
      await UserModel.create({
        clerkId,
        email,
        firstName,
        lastName,
        imageUrl,
      });
    }
    console.log("Huhkjas");
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create  user" });
  }
};
