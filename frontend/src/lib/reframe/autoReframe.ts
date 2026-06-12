"use client";

import type { FaceBox, ReframeConfig, ReframeFrame } from "./reframeTypes";
import { FaceTracker } from "./faceTracker";

const AR_RATIOS: Record<string, number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
};

/** Lerp-based exponential smoothing for crop center. */
function smooth(prev: number, next: number, alpha: number): number {
  return prev + alpha * (next - prev);
}

/**
 * Compute the optimal crop rect given face boxes and target aspect ratio.
 * Returns normalized coords (0–1) relative to source frame.
 */
export function computeCrop(
  faces: FaceBox[],
  srcW: number,
  srcH: number,
  targetAr: ReframeConfig["targetAr"],
): { cx: number; cy: number; cropW: number; cropH: number } {
  const ratio = AR_RATIOS[targetAr] ?? 9 / 16;
  const srcAr = srcW / srcH;

  // Crop dimensions in normalized space
  let cropW: number, cropH: number;
  if (ratio < srcAr) {
    // taller crop — constrained by height
    cropH = 1;
    cropW = ratio / srcAr;
  } else {
    cropW = 1;
    cropH = srcAr / ratio;
  }

  // Find the weighted center of all detected faces
  let cx = 0.5;
  let cy = 0.35; // default: slightly above center (typical subject framing)

  if (faces.length > 0) {
    let totalWeight = 0;
    let wx = 0;
    let wy = 0;
    for (const f of faces) {
      const weight = f.confidence * f.width * f.height;
      wx += (f.x + f.width / 2) * weight;
      wy += (f.y + f.height / 2) * weight;
      totalWeight += weight;
    }
    if (totalWeight > 0) {
      cx = wx / totalWeight;
      cy = wy / totalWeight;
    }
  }

  // Clamp so the crop stays within frame
  cx = Math.max(cropW / 2, Math.min(1 - cropW / 2, cx));
  cy = Math.max(cropH / 2, Math.min(1 - cropH / 2, cy));

  return { cx, cy, cropW, cropH };
}

/** Sample a video at regular intervals and produce a ReframeFrame[] plan. */
export async function reframePlan(
  videoEl: HTMLVideoElement,
  config: ReframeConfig,
): Promise<ReframeFrame[]> {
  const tracker = new FaceTracker();
  await tracker.init();

  const duration = videoEl.duration * 1000;
  const frames: ReframeFrame[] = [];

  let prevCx = 0.5;
  let prevCy = 0.35;

  for (let t = 0; t < duration; t += config.sampleRateMs) {
    videoEl.currentTime = t / 1000;
    // Wait for the frame to seek
    await new Promise<void>((res) => {
      const onSeeked = () => { videoEl.removeEventListener("seeked", onSeeked); res(); };
      videoEl.addEventListener("seeked", onSeeked);
    });

    const faces = await tracker.detect(videoEl);
    const srcW = videoEl.videoWidth || 1920;
    const srcH = videoEl.videoHeight || 1080;
    const { cx, cy, cropW, cropH } = computeCrop(faces, srcW, srcH, config.targetAr);

    const sCx = smooth(prevCx, cx, config.smoothingFactor);
    const sCy = smooth(prevCy, cy, config.smoothingFactor);
    prevCx = sCx;
    prevCy = sCy;

    frames.push({
      timeMs: t,
      cropX: (sCx - cropW / 2) * srcW,
      cropY: (sCy - cropH / 2) * srcH,
      cropW: cropW * srcW,
      cropH: cropH * srcH,
    });
  }

  tracker.destroy();
  return frames;
}
