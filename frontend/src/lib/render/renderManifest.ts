export interface RenderTimeline {
  fps: number;
  width: number;
  height: number;
  duration: number;
}

export interface RenderTrack {
  id: string;
  type: "video" | "audio";
  label: string;
  locked: boolean;
  muted: boolean;
}

export interface RenderClip {
  id: string;
  trackId: string;
  sourceId: string;
  startSec: number;
  endSec: number;
  timelineStartSec: number;
  speed: number;
  label?: string;
  colorLabel?: string;
}

export interface RenderCaption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: unknown;
}

export interface RenderOverlay {
  id: string;
  type: string;
  startSec?: number;
  durationSec?: number;
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  payload: Record<string, unknown>;
}

export interface RenderEffect {
  id: string;
  clipId?: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface RenderKeyframe {
  id: string;
  targetId: string;
  property: string;
  timeSec: number;
  value: unknown;
  easing?: string;
}

export interface RenderManifest {
  version: 1;
  generatedAt: number;
  timeline: RenderTimeline;
  tracks: RenderTrack[];
  clips: RenderClip[];
  captions: RenderCaption[];
  overlays: RenderOverlay[];
  effects: RenderEffect[];
  keyframes: RenderKeyframe[];
  sourceHash?: string;
}

export const EMPTY_RENDER_MANIFEST: RenderManifest = {
  version: 1,
  generatedAt: 0,
  timeline: {
    fps: 30,
    width: 1920,
    height: 1080,
    duration: 0,
  },
  tracks: [],
  clips: [],
  captions: [],
  overlays: [],
  effects: [],
  keyframes: [],
};
