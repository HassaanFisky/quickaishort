import { Response } from "express";
import { getDb } from "../config/neon.js";
import { projects } from "../models/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

const createProjectSchema = z.object({
  title: z.string().min(1).max(255).default("Untitled Project"),
  sourceUrl: z.string().url().optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  timelineData: z.record(z.unknown()).optional(),
  status: z.enum(["draft", "processing", "completed", "failed"]).optional(),
  r2VideoKey: z.string().optional(),
  thumbnail: z.string().optional(),
  duration: z.number().int().positive().optional(),
});

export async function createProject(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const db = getDb();
    const [project] = await db
      .insert(projects)
      .values({
        userId: req.dbUserId,
        title: parsed.data.title,
        sourceUrl: parsed.data.sourceUrl ?? null,
        status: "draft",
      })
      .returning();

    res.status(201).json(project);
  } catch (err) {
    console.error("Create project error:", err);
    res.status(500).json({ error: "Failed to create project" });
  }
}

export async function listProjects(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const db = getDb();
    const userProjects = await db.query.projects.findMany({
      where: eq(projects.userId, req.dbUserId),
      orderBy: [desc(projects.updatedAt)],
    });

    res.status(200).json(userProjects);
  } catch (err) {
    console.error("List projects error:", err);
    res.status(500).json({ error: "Failed to list projects" });
  }
}

export async function getProject(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    const db = getDb();

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.userId, req.dbUserId)),
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.status(200).json(project);
  } catch (err) {
    console.error("Get project error:", err);
    res.status(500).json({ error: "Failed to get project" });
  }
}

export async function updateProject(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    const parsed = updateProjectSchema.safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const db = getDb();

    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.userId, req.dbUserId)),
    });

    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.timelineData !== undefined)
      updateData.timelineData = parsed.data.timelineData;
    if (parsed.data.status !== undefined)
      updateData.status = parsed.data.status;
    if (parsed.data.r2VideoKey !== undefined)
      updateData.r2VideoKey = parsed.data.r2VideoKey;
    if (parsed.data.thumbnail !== undefined)
      updateData.thumbnail = parsed.data.thumbnail;
    if (parsed.data.duration !== undefined)
      updateData.duration = parsed.data.duration;

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(and(eq(projects.id, id), eq(projects.userId, req.dbUserId)))
      .returning();

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update project error:", err);
    res.status(500).json({ error: "Failed to update project" });
  }
}

export async function deleteProject(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    const db = getDb();

    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.userId, req.dbUserId)),
    });

    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    await db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, req.dbUserId)));

    res.status(200).json({ message: "Project deleted successfully" });
  } catch (err) {
    console.error("Delete project error:", err);
    res.status(500).json({ error: "Failed to delete project" });
  }
}
