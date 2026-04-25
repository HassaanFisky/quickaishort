import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  handleAuthCallback,
  getCurrentUser,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/callback", authMiddleware, handleAuthCallback as any);
router.get("/me", authMiddleware, getCurrentUser as any);

export default router;
