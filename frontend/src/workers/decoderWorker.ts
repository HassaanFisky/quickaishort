// @ts-nocheck — worker self-types not fully inferred in TS 5.9.3 module bundler
/**
 * Dedicated Web Worker for FFmpeg.wasm decode jobs.
 * Keeps the heavy WASM off the main thread.
 *
 * Message protocol:
 *   IN  { type: "decode",  id, sourceUrl: string, format?: string }
 *   IN  { type: "cancel",  id }
 *   OUT { type: "progress", id, ratio: number }
 *   OUT { type: "done",    id, data: ArrayBuffer }     (transferable)
 *   OUT { type: "error",   id, message: string }
 */

import { ffmpegDecode, resetFFmpegInstance } from "@/lib/decode/ffmpegWasmDecoder";

const activeJobs = new Set<string>();

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as { type: string; id: string; sourceUrl?: string; format?: string };

  if (msg.type === "decode") {
    const { id, sourceUrl, format } = msg;
    if (!sourceUrl) {
      self.postMessage({ type: "error", id, message: "sourceUrl required" });
      return;
    }

    activeJobs.add(id);

    try {
      const output = await ffmpegDecode({
        source: sourceUrl,
        format: format ?? "mp4",
        onProgress: ({ ratio }) => {
          if (!activeJobs.has(id)) return; // cancelled
          self.postMessage({ type: "progress", id, ratio });
        },
      });

      if (!activeJobs.has(id)) {
        // Cancelled before completion
        self.postMessage({ type: "error", id, message: "cancelled" });
        return;
      }

      activeJobs.delete(id);
      self.postMessage({ type: "done", id, data: output.buffer }, [output.buffer]);
    } catch (err) {
      activeJobs.delete(id);
      resetFFmpegInstance();
      self.postMessage({
        type: "error",
        id,
        message: err instanceof Error ? err.message : String(err),
      });
    }

  } else if (msg.type === "cancel") {
    activeJobs.delete(msg.id);
  }
};
