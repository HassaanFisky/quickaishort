// @ts-nocheck — leaf canvas compositor (intentionally loose, mirrors other export/ modules)

import type { FrameFilter, Caption, ExportSettings } from "@/stores/editorStore";

export const FILTER_PRESETS: Record<string, string> = {
  None: "none",
  Urban: "brightness(0.95) contrast(1.15) saturate(1.3) hue-rotate(-8deg)",
  Retro: "brightness(1.05) contrast(0.9) saturate(0.85) hue-rotate(15deg) sepia(0.25)",
  Cinematic: "brightness(0.92) contrast(1.18) saturate(1.1) hue-rotate(-4deg)",
};

export interface FrameCompositeOptions {
  filter: FrameFilter;
  presetFilter?: ExportSettings["filter"];
  captions?: Caption[];
  // Absolute source-video timestamp for this frame — used to pick which
  // captions are active (Caption.startTime/endTime are source-relative).
  currentTimeSec?: number;
  opacity?: number; // 0-1, overrides filter.opacity when provided
}

/**
 * Draws a video frame onto `ctx` with the active color filter, opacity, and
 * burned-in captions applied. The filter/opacity must be set on the context
 * *before* the source is drawn — canvas filters only affect new draws, not
 * pixels already on the canvas — so this owns the draw call itself rather
 * than post-processing an already-drawn frame.
 */
export function applyFrameComposite(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  opts: FrameCompositeOptions,
): void {
  const { filter, presetFilter = "None", captions = [], currentTimeSec, opacity } = opts;
  const effectiveOpacity = opacity ?? filter.opacity ?? 1;

  ctx.filter =
    presetFilter !== "None"
      ? FILTER_PRESETS[presetFilter] ?? "none"
      : `brightness(${filter.brightness}) contrast(${filter.contrast}) saturate(${filter.saturation}) hue-rotate(${filter.hue}deg)`;
  ctx.globalAlpha = Math.max(0, Math.min(1, effectiveOpacity));
  ctx.drawImage(source, 0, 0, sourceW, sourceH);
  ctx.globalAlpha = 1;
  ctx.filter = "none";

  const activeCaptions =
    currentTimeSec != null
      ? captions.filter((c) => currentTimeSec >= c.startTime && currentTimeSec <= c.endTime)
      : captions;
  for (const c of activeCaptions) {
    drawCaption(ctx, c, sourceW, sourceH);
  }
}

function drawCaption(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  c: Caption,
  W: number,
  H: number,
): void {
  const style = c.style;
  const fontSize = style.fontSize * (W / 1080);
  const yFrac = style.position === "top" ? 0.12 : style.position === "middle" ? 0.5 : 0.85;
  const x = W / 2;
  const y = yFrac * H;

  ctx.font = `${style.bold ? 800 : 500} ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (style.background) {
    const metrics = ctx.measureText(c.text);
    const padX = fontSize * 0.4;
    const padY = fontSize * 0.3;
    ctx.fillStyle = style.background;
    ctx.fillRect(x - metrics.width / 2 - padX, y - fontSize / 2 - padY, metrics.width + padX * 2, fontSize + padY * 2);
  }

  ctx.fillStyle = style.color;
  ctx.fillText(c.text, x, y);
}
