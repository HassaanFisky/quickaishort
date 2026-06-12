/** Types for the auto-reframe (16:9 → 9:16) pipeline. */

export type ReframeStrategy = "face" | "center" | "energy";

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

/** A single crop region for one video frame. */
export interface ReframeFrame {
  timeMs: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

export interface ReframeConfig {
  targetAr: "9:16" | "1:1" | "4:5";
  strategy: ReframeStrategy;
  sampleRateMs: number;
  smoothingFactor: number;
}

export const DEFAULT_REFRAME_CONFIG: ReframeConfig = {
  targetAr: "9:16",
  strategy: "face",
  sampleRateMs: 500,
  smoothingFactor: 0.15,
};
