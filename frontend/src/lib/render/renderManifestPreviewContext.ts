import { RenderManifest, RenderCaption, RenderOverlay, RenderEffect } from "./renderManifest";

export interface RenderPreviewContext {
  captions: RenderCaption[];
  overlays: RenderOverlay[];
  effects: RenderEffect[];
  activeCaptionIdsAt: (timeSec: number) => string[];
  activeOverlayIdsAt: (timeSec: number) => string[];
  activeCaptionsAt: (timeSec: number) => RenderCaption[];
  activeOverlaysAt: (timeSec: number) => RenderOverlay[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && isFinite(value);
}

function inRange(timeSec: number, startSec?: number, durationSec?: number): boolean {
  const start = isFiniteNumber(startSec) ? startSec : 0;
  const duration = isFiniteNumber(durationSec) ? durationSec : Infinity;
  return timeSec >= start && timeSec <= start + duration;
}

export function getPreviewContextFromManifest(manifest: RenderManifest | null): RenderPreviewContext {
  if (!manifest) {
    return {
      captions: [],
      overlays: [],
      effects: [],
      activeCaptionIdsAt: () => [],
      activeOverlayIdsAt: () => [],
      activeCaptionsAt: () => [],
      activeOverlaysAt: () => [],
    };
  }

  const captions = manifest.captions || [];
  const overlays = manifest.overlays || [];
  const effects = manifest.effects || [];

  return {
    captions,
    overlays,
    effects,
    activeCaptionIdsAt: (timeSec: number) => {
      if (!isFiniteNumber(timeSec)) return [];
      return captions
        .filter((caption) => {
          const start = isFiniteNumber(caption.startTime) ? caption.startTime : 0;
          const end = isFiniteNumber(caption.endTime) ? caption.endTime : 0;
          return timeSec >= start && timeSec <= end;
        })
        .map((c) => c.id);
    },
    activeOverlayIdsAt: (timeSec: number) => {
      if (!isFiniteNumber(timeSec)) return [];
      return overlays
        .filter((overlay) => {
          const start = overlay.startSec;
          const duration = overlay.durationSec;
          if (start === undefined || duration === undefined) {
            return true;
          }
          return inRange(timeSec, start, duration);
        })
        .map((o) => o.id);
    },
    activeCaptionsAt: (timeSec: number) => {
      if (!isFiniteNumber(timeSec)) return [];
      return captions.filter((caption) => {
        const start = isFiniteNumber(caption.startTime) ? caption.startTime : 0;
        const end = isFiniteNumber(caption.endTime) ? caption.endTime : 0;
        return timeSec >= start && timeSec <= end;
      });
    },
    activeOverlaysAt: (timeSec: number) => {
      if (!isFiniteNumber(timeSec)) return [];
      return overlays.filter((overlay) => {
        const start = overlay.startSec;
        const duration = overlay.durationSec;
        if (start === undefined || duration === undefined) {
          return true;
        }
        return inRange(timeSec, start, duration);
      });
    },
  };
}
