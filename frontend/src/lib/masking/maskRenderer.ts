"use client";

import type { ClipMask, RectMask, EllipseMask, BezierMask } from "./maskTypes";

/**
 * Renders a mask stack onto a 2D canvas.
 * Each mask is drawn to an offscreen canvas then composited.
 * AI person mask (ai_person) is handled by useMaskAI hook separately
 * and passed in as a pre-computed ImageData.
 */

function applyFeather(ctx: CanvasRenderingContext2D, feather: number, w: number, h: number): void {
  if (feather <= 0) return;
  const px = Math.max(1, feather * Math.min(w, h));
  ctx.filter = `blur(${px}px)`;
}

function drawRect(ctx: CanvasRenderingContext2D, m: RectMask, w: number, h: number): void {
  applyFeather(ctx, m.feather ?? 0, w, h);
  ctx.fillStyle = "white";
  ctx.fillRect(m.x * w, m.y * h, m.width * w, m.height * h);
  ctx.filter = "none";
}

function drawEllipse(ctx: CanvasRenderingContext2D, m: EllipseMask, w: number, h: number): void {
  applyFeather(ctx, m.feather ?? 0, w, h);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.ellipse(
    m.cx * w,
    m.cy * h,
    m.rx * w,
    m.ry * h,
    ((m.rotation ?? 0) * Math.PI) / 180,
    0,
    2 * Math.PI
  );
  ctx.fill();
  ctx.filter = "none";
}

function drawBezier(ctx: CanvasRenderingContext2D, m: BezierMask, w: number, h: number): void {
  if (m.points.length < 3) return;
  applyFeather(ctx, m.feather ?? 0, w, h);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(m.points[0].x * w, m.points[0].y * h);
  for (let i = 1; i < m.points.length - 1; i += 2) {
    const cp = m.points[i];
    const ep = m.points[i + 1] ?? m.points[0];
    ctx.quadraticCurveTo(cp.x * w, cp.y * h, ep.x * w, ep.y * h);
  }
  ctx.closePath();
  ctx.fill();
  ctx.filter = "none";
}

/**
 * Composite all masks onto `outputCtx` using `source-over`.
 * `aiMaskData` is pre-computed segmentation (from useMaskAI), or null.
 */
export function renderMasks(
  outputCtx: CanvasRenderingContext2D,
  masks: ClipMask[],
  aiMaskData: ImageData | null
): void {
  const { width: w, height: h } = outputCtx.canvas;
  outputCtx.clearRect(0, 0, w, h);

  for (const mask of masks) {
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    if (mask.shape === "ai_person") {
      if (aiMaskData) ctx.putImageData(aiMaskData, 0, 0);
    } else if (mask.shape === "rect") {
      drawRect(ctx, mask, w, h);
    } else if (mask.shape === "ellipse") {
      drawEllipse(ctx, mask as EllipseMask, w, h);
    } else if (mask.shape === "bezier") {
      drawBezier(ctx, mask as BezierMask, w, h);
    }

    if (mask.invert) {
      const invertCtx = document.createElement("canvas").getContext("2d")!;
      invertCtx.canvas.width = w;
      invertCtx.canvas.height = h;
      invertCtx.fillStyle = "white";
      invertCtx.fillRect(0, 0, w, h);
      invertCtx.globalCompositeOperation = "destination-out";
      invertCtx.drawImage(offscreen, 0, 0);
      outputCtx.drawImage(invertCtx.canvas, 0, 0);
    } else {
      outputCtx.globalCompositeOperation = "source-over";
      outputCtx.drawImage(offscreen, 0, 0);
    }
  }
}

/**
 * Apply a mask canvas as an alpha channel to a source frame canvas.
 * Result is written back to `sourceCtx`.
 */
export function applyMaskAsAlpha(
  sourceCtx: CanvasRenderingContext2D,
  maskCtx: CanvasRenderingContext2D
): void {
  sourceCtx.globalCompositeOperation = "destination-in";
  sourceCtx.drawImage(maskCtx.canvas, 0, 0);
  sourceCtx.globalCompositeOperation = "source-over";
}
