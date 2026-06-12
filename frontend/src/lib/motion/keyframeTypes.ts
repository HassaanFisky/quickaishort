"use client";

/** Motion keyframe types for the editor timeline. */

export type EasingType =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "bezier"; // uses controlPoints

export interface BezierEasing {
  type: "bezier";
  /** Cubic bezier control points [p1x, p1y, p2x, p2y] in [0,1] range. */
  controlPoints: [number, number, number, number];
}

export interface StandardEasing {
  type: Exclude<EasingType, "bezier">;
}

export type Easing = BezierEasing | StandardEasing;

export type AnimatableProperty =
  | "x"
  | "y"
  | "scaleX"
  | "scaleY"
  | "rotation"
  | "opacity"
  | "cropLeft"
  | "cropRight"
  | "cropTop"
  | "cropBottom";

export interface Keyframe {
  id: string;
  timeMs: number;    // position on timeline in milliseconds
  value: number;     // property value at this keyframe
  easing: Easing;    // interpolation to the NEXT keyframe
}

export interface PropertyTrack {
  property: AnimatableProperty;
  keyframes: Keyframe[];
}

export interface MotionPath {
  clipId: string;
  tracks: PropertyTrack[];
}

/** Interpolate between keyframes at `timeMs`. */
export function interpolateTrack(track: PropertyTrack, timeMs: number): number {
  const kfs = track.keyframes;
  if (kfs.length === 0) return 0;
  if (timeMs <= kfs[0].timeMs) return kfs[0].value;
  if (timeMs >= kfs[kfs.length - 1].timeMs) return kfs[kfs.length - 1].value;

  // Find surrounding keyframes
  let lo = kfs[0];
  let hi = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (timeMs >= kfs[i].timeMs && timeMs <= kfs[i + 1].timeMs) {
      lo = kfs[i];
      hi = kfs[i + 1];
      break;
    }
  }

  const t = (timeMs - lo.timeMs) / (hi.timeMs - lo.timeMs);
  const eased = applyEasing(t, lo.easing);
  return lo.value + (hi.value - lo.value) * eased;
}

/** Map raw t ∈ [0,1] through the given easing. */
function applyEasing(t: number, easing: Easing): number {
  switch (easing.type) {
    case "linear":      return t;
    case "ease-in":     return t * t;
    case "ease-out":    return 1 - (1 - t) * (1 - t);
    case "ease-in-out": return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "bezier":      return solveCubicBezier(t, easing.controlPoints);
    default:            return t;
  }
}

/** Newton–Raphson solve for CSS cubic-bezier (p1x, p1y, p2x, p2y). */
function solveCubicBezier(
  t: number,
  [p1x, p1y, p2x, p2y]: [number, number, number, number]
): number {
  // Find x = t by solving cubic parametric, then eval y
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = cubicBezierValue(u, p1x, p2x) - t;
    const dx = cubicBezierDerivative(u, p1x, p2x);
    if (Math.abs(dx) < 1e-6) break;
    u -= x / dx;
  }
  return cubicBezierValue(u, p1y, p2y);
}

function cubicBezierValue(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

function cubicBezierDerivative(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
}
