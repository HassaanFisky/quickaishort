import type { RenderManifest } from "@/lib/render/renderManifest";

export type ExportQuality = "low" | "medium" | "high";
export type ExportAspect = "9:16" | "1:1";

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
  /** Per-session isolation id so a superseded worker run discards its result. */
  runId?: string;
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
  audio_boost?: number;
  playback_speed?: number;
  noise_suppression?: number;
  filter_name?: string;
  transition_enabled?: boolean;
  voiceover_enabled?: boolean;
  mute_source_audio?: boolean;
  dub_audio_uri?: string | null;
  render_manifest?: RenderManifest | null;
  /** EP-002 — optional Studio Kernel pin (legacy omits) */
  project_id?: string | null;
  project_revision?: number | null;
}

export interface ExportEnqueueResponse {
  status: "queued";
  job_id: string;
  subscribe_channel: string;
}

export type ExportJobStatus =
  | "queued"
  | "preparing"
  | "analyzing"
  | "planning"
  | "executing"
  | "rendering"
  | "verifying"
  | "started"
  | "deferred"
  | "scheduled"
  | "finished"
  | "complete"
  | "failed"
  | "stopped"
  | "canceled"
  | "unknown";

export interface ExportStatusResponse {
  status: ExportJobStatus;
  job_id: string;
  download_url?: string;
  error?: string;
  progress?: number;
  current_step?: string;
  message?: string;
  verification?: {
    passed?: boolean;
    checks?: Record<string, boolean>;
    duration_sec?: number | null;
    width?: number | null;
    height?: number | null;
    has_video?: boolean;
    has_audio?: boolean;
    error?: string | null;
  };
  meta?: {
    duration_sec?: number;
    file_size_bytes?: number;
    elapsed_sec?: number;
  };
}
