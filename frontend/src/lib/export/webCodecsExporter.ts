// @ts-nocheck — VideoEncoder, AudioEncoder, VideoFrame, OffscreenCanvas not in TS 5.x bundled lib.dom.d.ts
/**
 * WebCodecs-based client-side exporter.
 * Encodes video frames via VideoEncoder (H.264, hardware-accelerated when available)
 * and muxes to MP4 via mp4-muxer. Feature-flagged behind `webcodecs_export_enabled`.
 * Only suitable for clips ≤ 60 s.
 */
import { getFlag } from "@/lib/featureFlags";
import { Mp4Mux } from "./mp4Mux";

export const WEBCODECS_FLAG = "webcodecs_export_enabled";
export const MAX_CLIP_SECONDS = 60;

export interface ExportPreset {
  label: string;
  width: number;
  height: number;
  frameRate: number;
  videoBitrate: number;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { label: "720p 30fps", width: 720, height: 1280, frameRate: 30, videoBitrate: 3_000_000 },
  { label: "1080p 30fps", width: 1080, height: 1920, frameRate: 30, videoBitrate: 6_000_000 },
  { label: "1080p 60fps", width: 1080, height: 1920, frameRate: 60, videoBitrate: 10_000_000 },
];

export interface ExportProgress {
  encoded: number;
  total: number;
  cancelled: boolean;
}

export class WebCodecsExporter {
  private encoder: any = null;
  private mux: Mp4Mux | null = null;
  private offscreen: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private cancelled = false;
  private frameCount = 0;

  static async isSupported(): Promise<boolean> {
    try {
      if (typeof VideoEncoder === "undefined") return false;
      const result = await VideoEncoder.isConfigSupported({
        codec: "avc1.42001f",
        width: 1080,
        height: 1920,
        bitrate: 6_000_000,
        framerate: 30,
        hardwareAcceleration: "prefer-hardware",
      });
      return result.supported === true;
    } catch {
      return false;
    }
  }

  static async isFlagEnabled(): Promise<boolean> {
    return getFlag(WEBCODECS_FLAG);
  }

  async init(preset: ExportPreset): Promise<void> {
    this.cancelled = false;
    this.frameCount = 0;
    this.offscreen = new OffscreenCanvas(preset.width, preset.height);
    this.ctx = this.offscreen.getContext("2d") as OffscreenCanvasRenderingContext2D;
    this.mux = new Mp4Mux({
      width: preset.width,
      height: preset.height,
      frameRate: preset.frameRate,
    });
    this.encoder = new VideoEncoder({
      output: (chunk: any, meta?: any) => {
        this.mux!.addVideoChunk(chunk, meta);
      },
      error: (e: Error) => console.error("[WebCodecsExporter] encoder error:", e),
    });
    await this.encoder.configure({
      codec: "avc1.42001f",
      width: preset.width,
      height: preset.height,
      bitrate: preset.videoBitrate,
      framerate: preset.frameRate,
      hardwareAcceleration: "prefer-hardware",
    });
  }

  async encodeFrameAt(
    source: HTMLVideoElement,
    timestampUs: number,
    frameRate: number,
  ): Promise<void> {
    if (this.cancelled || !this.encoder || !this.ctx || !this.offscreen) return;
    this.ctx.drawImage(source, 0, 0, this.offscreen.width, this.offscreen.height);
    const frame = new VideoFrame(this.offscreen, { timestamp: timestampUs });
    const isKey = this.frameCount % Math.max(1, Math.round(frameRate * 2)) === 0;
    this.encoder.encode(frame, { keyFrame: isKey });
    frame.close();
    this.frameCount++;
  }

  async finalize(): Promise<Blob> {
    if (!this.encoder || !this.mux) throw new Error("WebCodecsExporter not initialized");
    await this.encoder.flush();
    return this.mux.finalize();
  }

  cancel(): void {
    this.cancelled = true;
  }

  dispose(): void {
    try { this.encoder?.close(); } catch {}
    this.encoder = null;
    this.mux = null;
    this.offscreen = null;
    this.ctx = null;
  }
}
