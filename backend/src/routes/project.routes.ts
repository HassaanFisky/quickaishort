import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} from "../controllers/project.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", listProjects as any);
router.post("/", createProject as any);
router.get("/:id", getProject as any);
router.patch("/:id", updateProject as any);
router.delete("/:id", deleteProject as any);

export default router;
