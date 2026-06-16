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
export const MAX_CLIP_SECONDS = 300; // 5 minutes — covers all short-form content

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
  private audioEncoder: any = null;
  private audioSupported = false;
  private mux: Mp4Mux | null = null;
  private offscreen: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private cancelled = false;
  private frameCount = 0;

  hasAudioEncoder(): boolean {
    return this.audioSupported;
  }

  static hasAudioSupport(): boolean {
    return typeof AudioEncoder !== "undefined";
  }

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
    this.audioSupported = false;
    this.offscreen = new OffscreenCanvas(preset.width, preset.height);
    this.ctx = this.offscreen.getContext("2d") as OffscreenCanvasRenderingContext2D;

    const hasAudio = typeof AudioEncoder !== "undefined";
    this.mux = new Mp4Mux({
      width: preset.width,
      height: preset.height,
      frameRate: preset.frameRate,
      ...(hasAudio ? { sampleRate: 48000, numberOfChannels: 2 } : {}),
    });

    this.encoder = new VideoEncoder({
      output: (chunk: any, meta?: any) => {
        this.mux!.addVideoChunk(chunk, meta);
      },
      error: (e: Error) => {
        if (process.env.NODE_ENV !== "production") console.error("[WebCodecsExporter]", e);
      },
    });
    await this.encoder.configure({
      codec: "avc1.42001f",
      width: preset.width,
      height: preset.height,
      bitrate: preset.videoBitrate,
      framerate: preset.frameRate,
      hardwareAcceleration: "prefer-hardware",
    });

    if (hasAudio) {
      try {
        this.audioEncoder = new AudioEncoder({
          output: (chunk: any, meta?: any) => {
            this.mux!.addAudioChunk(chunk, meta);
          },
          error: (e: Error) => {
            if (process.env.NODE_ENV !== "production") console.error("[AudioEncoder]", e);
          },
        });
        await this.audioEncoder.configure({
          codec: "mp4a.40.2",
          sampleRate: 48000,
          numberOfChannels: 2,
          bitrate: 128_000,
        });
        this.audioSupported = true;
      } catch {
        this.audioEncoder = null;
      }
    }
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

  async encodeAudioChunk(chunk: { data: Float32Array; timestamp: number; numberOfFrames: number }): Promise<void> {
    if (!this.audioEncoder || !this.audioSupported || this.cancelled) return;

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate: 48000,
      numberOfFrames: chunk.numberOfFrames,
      numberOfChannels: 2,
      timestamp: chunk.timestamp,
      data: chunk.data,
    });

    this.audioEncoder.encode(audioData);
    audioData.close();
  }

  async finalize(): Promise<Blob> {
    if (!this.encoder || !this.mux) throw new Error("WebCodecsExporter not initialized");
    await this.encoder.flush();
    if (this.audioEncoder && this.audioSupported) {
      try { await this.audioEncoder.flush(); } catch {}
    }
    return this.mux.finalize();
  }

  cancel(): void {
    this.cancelled = true;
  }

  dispose(): void {
    try { this.encoder?.close(); } catch {}
    try { this.audioEncoder?.close(); } catch {}
    this.encoder = null;
    this.audioEncoder = null;
    this.audioSupported = false;
    this.mux = null;
    this.offscreen = null;
    this.ctx = null;
  }
}
