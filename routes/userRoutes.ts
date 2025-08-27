import { Router } from "express";
import { createUser } from "../controllers/userController";
import { requireAuth } from "@clerk/express";

const router = Router();

router.post("/new-user", requireAuth(), createUser);

export default router;
