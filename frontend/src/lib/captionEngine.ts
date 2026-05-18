import type { Caption, FrameFilter } from "@/stores/editorStore";

// Binary search — O(log n) — safe to call every animation frame at 60fps
export function findActiveCaption(captions: Caption[], currentTime: number): Caption | null {
  if (captions.length === 0) return null;

  let low = 0;
  let high = captions.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const cap = captions[mid];

    if (currentTime >= cap.startTime && currentTime <= cap.endTime) {
      return cap;
    }
    if (currentTime < cap.startTime) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return null;
}

// Build CSS filter string from FrameFilter values
export function buildCSSFilter(filters: FrameFilter): string {
  const parts: string[] = [];
  if (filters.brightness !== 1) parts.push(`brightness(${filters.brightness})`);
  if (filters.contrast !== 1) parts.push(`contrast(${filters.contrast})`);
  if (filters.saturation !== 1) parts.push(`saturate(${filters.saturation})`);
  if (filters.hue !== 0) parts.push(`hue-rotate(${filters.hue}deg)`);
  if (filters.blur !== 0) parts.push(`blur(${filters.blur}px)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

// Detect native aspect ratio bucket (5% tolerance)
export function detectAspectRatio(width: number, height: number): string {
  if (width === 0 || height === 0) return "16 / 9";
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.1) return "16 / 9";
  if (Math.abs(ratio - 9 / 16) < 0.05) return "9 / 16";
  if (Math.abs(ratio - 1) < 0.05) return "1 / 1";
  if (Math.abs(ratio - 4 / 3) < 0.1) return "4 / 3";
  return `${width} / ${height}`;
}
