/** QEP (QuickEditor Project) v1 — serializable project schema. */

export const QEP_VERSION = 1;

export interface QepCaption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style?: Record<string, unknown>;
}

export interface QepColorState {
  exposure?: number;
  contrast?: number;
  saturation?: number;
  lift?: [number, number, number];
  gamma?: [number, number, number];
  gain?: [number, number, number];
  offset?: [number, number, number];
  lutUrl?: string;
  lutIntensity?: number;
}

export interface QepMaskEntry {
  type: "rect" | "ellipse" | "bezier" | "ai_person";
  params: Record<string, unknown>;
}

export interface QepKeyframe {
  id: string;
  property: string;
  timeMs: number;
  value: number;
  easing?: string;
}

export interface QepClip {
  id: string;
  sourceUrl: string;
  startTime: number;
  endTime: number;
  trackIndex: number;
  volume: number;
  speed: number;
  visualFilter: string;
  colorState?: QepColorState;
  masks?: QepMaskEntry[];
  keyframes?: QepKeyframe[];
  captions?: QepCaption[];
}

export interface QepAudioBus {
  id: string;
  gainDb: number;
  denoiseEnabled: boolean;
  limiterEnabled: boolean;
}

export interface QepProject {
  version: typeof QEP_VERSION;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  aspectRatio: "9:16" | "1:1" | "16:9" | "4:5";
  clips: QepClip[];
  audioBuses: QepAudioBus[];
  masterGainDb: number;
}
