export type ExportQuality = "low" | "medium" | "high";
export type ExportAspect = "9:16" | "16:9" | "1:1";

/** A text or sticker overlay composited by FFmpeg drawtext/overlay. */
export interface CanvasOverlay {
  type: "text" | "sticker";
  /** Raw text string or emoji character */
  content: string;
  /** Fractional position — 0.0 (left/top) to 1.0 (right/bottom) */
  x_pct: number;
  y_pct: number;
  scale: number;
  rotation: number;
}

export interface ExportRequestPayload {
  videoId: string;
  start_sec: number;
  end_sec: number;
  user_id: string;
  aspect_ratio: ExportAspect;
  quality: ExportQuality;
  captions: {
    enabled: boolean;
    srt_content: string;
    style?: string | null;
  };
  watermark_enabled: boolean;
  reframing?: {
    center: { x: number; y: number };
    scale: number;
  } | null;
  /** Canvas text/sticker overlays to composite on export */
  canvas_overlays?: CanvasOverlay[];
}

export interface ExportEnqueueResponse {
  status: "queued";
  job_id: string;
  subscribe_channel: string;
}

export type ExportJobStatus =
  | "queued"
  | "started"
  | "deferred"
  | "scheduled"
  | "finished"
  | "failed"
  | "stopped"
  | "canceled"
  | "unknown";

export interface ExportStatusResponse {
  status: ExportJobStatus;
  job_id: string;
  download_url?: string;
  error?: string;
  meta?: {
    duration_sec?: number;
    file_size_bytes?: number;
    elapsed_sec?: number;
  };
}
