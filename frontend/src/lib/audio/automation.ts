"use client";

/**
 * Automation lane: time-keyed parameter changes for AudioParam.
 * Supports linear ramp, exponential ramp, and instant set.
 */

export type AutomationCurve = "linear" | "exponential" | "instant";

export interface AutomationPoint {
  timeMs: number;
  value: number;
  curve?: AutomationCurve;
}

export interface AutomationLane {
  paramName: string;
  points: AutomationPoint[];
}

/** Apply all automation lanes to a set of AudioParams, offset by `startTimeAudio`. */
export function applyAutomation(
  lanes: AutomationLane[],
  params: Record<string, AudioParam>,
  startTimeAudio: number
): void {
  for (const lane of lanes) {
    const param = params[lane.paramName];
    if (!param) continue;
    for (const pt of lane.points) {
      const t = startTimeAudio + pt.timeMs / 1000;
      const curve = pt.curve ?? "linear";
      if (curve === "instant") {
        param.setValueAtTime(pt.value, t);
      } else if (curve === "exponential") {
        const safeVal = pt.value === 0 ? 0.0001 : pt.value;
        param.exponentialRampToValueAtTime(safeVal, t);
      } else {
        param.linearRampToValueAtTime(pt.value, t);
      }
    }
  }
}

/** Cancel all automation from `fromTimeAudio` forward and hold current value. */
export function cancelAutomationFrom(
  lanes: AutomationLane[],
  params: Record<string, AudioParam>,
  fromTimeAudio: number
): void {
  for (const lane of lanes) {
    const param = params[lane.paramName];
    if (!param) continue;
    param.cancelScheduledValues(fromTimeAudio);
    param.setValueAtTime(param.value, fromTimeAudio);
  }
}

/** Build a simple fade-in automation lane (0 → 1 over `durationMs`). */
export function buildFadeIn(durationMs: number): AutomationLane {
  return {
    paramName: "gain",
    points: [
      { timeMs: 0, value: 0, curve: "instant" },
      { timeMs: durationMs, value: 1, curve: "linear" },
    ],
  };
}

/** Build a simple fade-out automation lane (1 → 0 over `durationMs`). */
export function buildFadeOut(startMs: number, durationMs: number): AutomationLane {
  return {
    paramName: "gain",
    points: [
      { timeMs: startMs, value: 1, curve: "instant" },
      { timeMs: startMs + durationMs, value: 0, curve: "linear" },
    ],
  };
}
