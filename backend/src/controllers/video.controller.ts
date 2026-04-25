import { Response } from "express";
import axios from "axios";
import { getDb } from "../config/neon.js";
import { projects } from "../models/schema.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { z } from "zod";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

const fetchInfoSchema = z.object({
  youtubeUrl: z.string().url(),
});

export async function fetchVideoInfo(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parsed = fetchInfoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A valid YouTube URL is required" });
      return;
    }

    const response = await axios.get(`${ENGINE_URL}/api/info`, {
      params: { url: parsed.data.youtubeUrl },
      timeout: 30000,
    });

    const videoData = response.data;
    const db = getDb();

    const [project] = await db
      .insert(projects)
      .values({
        userId: req.dbUserId,
        title: videoData.title || "Untitled Project",
        sourceUrl: parsed.data.youtubeUrl,
        thumbnail: videoData.thumbnail ?? null,
        duration: videoData.duration ?? null,
        status: "draft",
      })
      .returning();

    res.status(201).json({
      project,
      videoInfo: videoData,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch video information";
    console.error("Video fetch error:", message);
    res.status(500).json({ error: message });
  }
}

export async function proxyVideo(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "URL query parameter is required" });
    return;
  }

  try {
    const response = await axios({
      method: "get",
      url: `${ENGINE_URL}/api/proxy`,
      params: { url },
      responseType: "stream",
      timeout: 120000,
    });

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    response.data.pipe(res);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to proxy video";
    console.error("Video proxy error:", message);
    res.status(500).json({ error: message });
  }
}
