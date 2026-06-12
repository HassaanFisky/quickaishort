// @ts-nocheck — VideoEncoder, VideoFrame, EncodedVideoChunk not in TS 5.x bundled lib.dom.d.ts
/**
 * Dedicated Web Worker for hardware-accelerated video encoding + MP4 muxing.
 * Receives VideoFrame transfers from the main thread and returns a final ArrayBuffer.
 * postMessage envelope: { type, payload }
 */
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

interface InitPayload {
  width: number;
  height: number;
  frameRate: number;
  videoBitrate: number;
  totalFrames: number;
}

let encoder: VideoEncoder | null = null;
let muxer: Muxer<ArrayBufferTarget> | null = null;
let target: ArrayBufferTarget | null = null;
let encoded = 0;
let total = 0;
let frameIndex = 0;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data as { type: string; payload: any };

  switch (type) {
    case "init": {
      const opts = payload as InitPayload;
      total = opts.totalFrames;
      encoded = 0;
      frameIndex = 0;

      target = new ArrayBufferTarget();
      muxer = new Muxer({
        target,
        video: {
          codec: "avc",
          width: opts.width,
          height: opts.height,
          frameRate: opts.frameRate,
        },
        fastStart: "in-memory",
        firstTimestampBehavior: "offset",
      });

      encoder = new VideoEncoder({
        output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
          muxer!.addVideoChunk(chunk, meta);
          encoded++;
          self.postMessage({ type: "progress", payload: { encoded, total } });
        },
        error: (err: Error) => {
          self.postMessage({ type: "error", payload: { message: err.message } });
        },
      });

      await encoder.configure({
        codec: "avc1.42001f",
        width: opts.width,
        height: opts.height,
        bitrate: opts.videoBitrate,
        framerate: opts.frameRate,
        hardwareAcceleration: "prefer-hardware",
      });

      self.postMessage({ type: "ready" });
      break;
    }

    case "frame": {
      const { frame, timestampUs } = payload as { frame: VideoFrame; timestampUs: number };
      if (!encoder) { frame.close(); break; }
      const isKey = frameIndex % Math.max(1, Math.round(total / 10)) === 0;
      encoder.encode(frame, { keyFrame: isKey });
      frame.close();
      frameIndex++;
      break;
    }

    case "finalize": {
      if (!encoder || !muxer || !target) {
        self.postMessage({ type: "error", payload: { message: "Worker not initialized" } });
        break;
      }
      await encoder.flush();
      muxer.finalize();
      self.postMessage(
        { type: "done", payload: { buffer: target.buffer } },
        [target.buffer],
      );
      encoder = null;
      muxer = null;
      target = null;
      break;
    }

    case "cancel": {
      try { encoder?.close(); } catch {}
      encoder = null;
      muxer = null;
      target = null;
      self.postMessage({ type: "cancelled" });
      break;
    }
  }
};
