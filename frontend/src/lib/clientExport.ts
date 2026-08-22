/**
 * Client-side clip capture via MediaRecorder.
 * Share Sheet when the browser allows it; otherwise a download.
 * Safari often lacks captureStream — callers must show LOOP_COPY.shareUnsupported.
 */

import { LOOP_COPY } from "@/lib/studio/computePlane";

export type DeviceShareResult = "shared" | "downloaded";

type CaptureVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function pickRecorderMime(): string {
  const candidates = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

export function canCaptureStream(): boolean {
  if (typeof document === "undefined") return false;
  const proto = HTMLVideoElement.prototype as CaptureVideo;
  return typeof proto.captureStream === "function" || typeof proto.mozCaptureStream === "function";
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.canShare !== "function") return true;
  try {
    const probe = new File([new Blob(["x"], { type: "video/mp4" })], "probe.mp4", {
      type: "video/mp4",
    });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function shareOrSaveBlob(
  blob: Blob,
  filename: string,
  mime: string,
): Promise<DeviceShareResult> {
  const file = new File([blob], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function") {
    const payload: ShareData = { files: [file], title: filename };
    const allowed = typeof nav.canShare !== "function" || nav.canShare(payload);
    if (allowed) {
      try {
        await nav.share(payload);
        return "shared";
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return "shared";
        }
      }
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  return "downloaded";
}

async function recordRange(
  video: CaptureVideo,
  startSec: number,
  endSec: number,
  onProgress?: (pct: number) => void,
): Promise<{ blob: Blob; mime: string }> {
  const captureStream = video.captureStream?.() ?? video.mozCaptureStream?.();
  if (!captureStream) {
    throw new Error(LOOP_COPY.shareUnsupported);
  }

  const mime = pickRecorderMime();
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(captureStream, { mimeType: mime });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const clipDuration = Math.max(0.1, endSec - startSec);
  let tick: number | undefined;

  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
      recorder.onerror = (e: Event) => {
        reject(new Error((e as ErrorEvent).message ?? "MediaRecorder error"));
      };

      recorder.start(200);
      void video.play().catch(reject);

      let elapsed = 0;
      tick = window.setInterval(() => {
        elapsed += 0.2;
        onProgress?.(Math.min(99, Math.round((elapsed / clipDuration) * 100)));
        if (elapsed >= clipDuration) {
          if (tick !== undefined) window.clearInterval(tick);
          tick = undefined;
          recorder.stop();
          video.pause();
        }
      }, 200);
    });
    onProgress?.(100);
    return { blob, mime };
  } finally {
    if (tick !== undefined) window.clearInterval(tick);
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}

async function seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = timeSec;
    if (video.readyState >= 2 && Math.abs(video.currentTime - timeSec) < 0.08) {
      video.removeEventListener("seeked", done);
      resolve();
    }
  });
}

function withExt(filename: string, mime: string): string {
  const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
  return filename.replace(/\.[^.]+$/, `.${ext}`);
}

export async function exportLocalClip(
  file: File,
  startSec: number,
  endSec: number,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<DeviceShareResult> {
  if (!canCaptureStream()) {
    throw new Error(LOOP_COPY.shareUnsupported);
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video") as CaptureVideo;
  video.src = objectUrl;
  video.muted = false;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to load video file"));
    });
    await seekTo(video, startSec);
    const { blob, mime } = await recordRange(video, startSec, endSec, onProgress);
    return shareOrSaveBlob(blob, withExt(filename, mime), mime);
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}

/** Capture from the already-loaded preview element (YouTube/proxy or blob). */
export async function exportPreviewRange(
  videoEl: HTMLVideoElement,
  startSec: number,
  endSec: number,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<DeviceShareResult> {
  if (!canCaptureStream()) {
    throw new Error(LOOP_COPY.shareUnsupported);
  }

  const video = videoEl as CaptureVideo;
  const originalTime = video.currentTime;
  const wasPlaying = !video.paused;
  try {
    await seekTo(video, startSec);
    const { blob, mime } = await recordRange(video, startSec, endSec, onProgress);
    return shareOrSaveBlob(blob, withExt(filename, mime), mime);
  } finally {
    video.pause();
    video.currentTime = originalTime;
    if (wasPlaying) void video.play().catch(() => undefined);
  }
}
