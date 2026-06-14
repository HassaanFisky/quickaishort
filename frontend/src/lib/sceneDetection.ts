/**
 * Client-side scene/cut detection via frame-difference analysis.
 * Seeks through the video at `sampleInterval`-second steps, compares
 * adjacent frames using mean RGB difference, and marks cuts where the
 * difference exceeds `threshold` (0–1).
 */
export async function detectScenes(
  video: HTMLVideoElement,
  options: { threshold?: number; sampleInterval?: number; maxSamples?: number } = {}
): Promise<number[]> {
  const { threshold = 0.15, sampleInterval = 0.5, maxSamples = 600 } = options;

  // Low-res canvas for speed
  const W = 160;
  const H = 90;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const cuts: number[] = [];
  let prevData: Uint8ClampedArray | null = null;
  const duration = video.duration;
  if (!isFinite(duration) || duration <= 0) return [];

  const totalSteps = Math.min(Math.ceil(duration / sampleInterval), maxSamples);

  for (let step = 0; step < totalSteps; step++) {
    const t = step * sampleInterval;
    if (t >= duration) break;

    // Seek and wait for the frame
    video.currentTime = t;
    await new Promise<void>((resolve) => {
      const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
      video.addEventListener("seeked", onSeeked);
    });

    try {
      ctx.drawImage(video, 0, 0, W, H);
      const frame = ctx.getImageData(0, 0, W, H);

      if (prevData) {
        let diff = 0;
        const pixels = frame.data.length / 4;
        for (let i = 0; i < frame.data.length; i += 4) {
          diff += Math.abs(frame.data[i]     - prevData[i]);
          diff += Math.abs(frame.data[i + 1] - prevData[i + 1]);
          diff += Math.abs(frame.data[i + 2] - prevData[i + 2]);
        }
        // Normalize: 3 channels × 255 × pixel count
        const normalized = diff / (3 * 255 * pixels);
        if (normalized > threshold) {
          cuts.push(parseFloat(t.toFixed(2)));
        }
      }

      prevData = new Uint8ClampedArray(frame.data);
    } catch {
      // Cross-origin or unavailable frame — skip this sample
    }
  }

  return cuts;
}
