import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { fetchVideoInfo, proxyVideo } from "../controllers/video.controller.js";

const router = Router();

router.post("/fetch", authMiddleware, fetchVideoInfo as any);
router.get("/proxy", proxyVideo as any);

export default router;
