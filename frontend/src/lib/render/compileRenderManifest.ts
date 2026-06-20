import {
  RenderManifest,
  RenderTimeline,
  RenderTrack,
  RenderClip,
  RenderCaption,
  RenderOverlay,
  RenderEffect,
  RenderKeyframe,
} from "./renderManifest";

// Import types dynamically or use compatible interfaces to avoid circular dependency runtime issues
import type { VideoMetadata, Caption, EditorElement, FrameFilter, ExportSettings } from "@/stores/editorStore";

// Let's define a compatible structure for EditorState to prevent strict circular issues.
interface CompileEditorState {
  duration: number;
  resolution: { width: number; height: number } | null;
  videoMetadata: VideoMetadata | null;
  sourceUrl: string | null;
  sourceFile: File | null;
  suggestions: any[];
  tracks: any[];
  captions: Caption[];
  elements: EditorElement[];
  frameFilters: FrameFilter;
  exportSettings: ExportSettings;
  defaultTransition: string;
  splitScreenPresetId: string | null;
}

export function compileRenderManifest(state: CompileEditorState): RenderManifest {
  // 1. Compile Timeline
  const width = state.resolution?.width 
    || state.videoMetadata?.nativeWidth 
    || 1920;
  const height = state.resolution?.height 
    || state.videoMetadata?.nativeHeight 
    || 1080;
  const fps = state.videoMetadata?.fps || 30;
  const duration = state.duration 
    || state.videoMetadata?.duration 
    || 0;

  const timeline: RenderTimeline = {
    fps,
    width,
    height,
    duration,
  };

  // 2. Compile Tracks & Clips
  let tracks: RenderTrack[] = [];
  let clips: RenderClip[] = [];
  let hasTrackClips = false;

  if (state.tracks && state.tracks.length > 0) {
    tracks = state.tracks.map((t) => ({
      id: t.id,
      type: t.type,
      label: t.label,
      locked: !!t.locked,
      muted: !!t.muted,
    }));

    for (const track of state.tracks) {
      if (track.clips && track.clips.length > 0) {
        hasTrackClips = true;
        for (const tc of track.clips) {
          clips.push({
            id: tc.id,
            trackId: tc.trackId,
            sourceId: tc.sourceId || "",
            startSec: typeof tc.inPoint === "number" ? tc.inPoint : 0,
            endSec: typeof tc.outPoint === "number" ? tc.outPoint : 0,
            timelineStartSec: typeof tc.timelineStart === "number" ? tc.timelineStart : 0,
            speed: typeof tc.speed === "number" ? tc.speed : 1,
            label: tc.label,
            colorLabel: tc.colorLabel,
          });
        }
      }
    }
  }

  // Fallback to suggestions if tracks are empty or have no clips
  if (!hasTrackClips && state.suggestions && state.suggestions.length > 0) {
    const defaultTrackId = (state.tracks && state.tracks[0]?.id) || "v1";
    const defaultSourceId = state.sourceUrl || (state.sourceFile ? state.sourceFile.name : "") || "source";

    // If tracks was completely empty, make sure we declare the default track in manifest
    if (tracks.length === 0) {
      tracks = [
        {
          id: defaultTrackId,
          type: "video",
          label: "V1",
          locked: false,
          muted: false,
        },
      ];
    }

    let currentTimelineStart = 0;
    for (const s of state.suggestions) {
      const startSec = typeof s.inPoint === "number" ? s.inPoint : s.start;
      const endSec = typeof s.outPoint === "number" ? s.outPoint : s.end;
      const durationVal = endSec - startSec;
      clips.push({
        id: s.id,
        trackId: defaultTrackId,
        sourceId: defaultSourceId,
        startSec,
        endSec,
        timelineStartSec: currentTimelineStart,
        speed: 1,
        label: s.title || s.reason || undefined,
        colorLabel: s.colorLabel,
      });
      currentTimelineStart += durationVal;
    }
  }

  // 3. Compile Captions
  const captions: RenderCaption[] = (state.captions || []).map((c) => ({
    id: c.id,
    text: c.text,
    startTime: c.startTime,
    endTime: c.endTime,
    style: c.style,
  }));

  // 4. Compile Overlays (elements)
  const overlays: RenderOverlay[] = (state.elements || []).map((el) => {
    const overlay: RenderOverlay = {
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      scale: el.scale,
      rotation: el.rotation,
      payload: { ...el } as unknown as Record<string, unknown>,
    };

    if ("start_sec" in el && typeof el.start_sec === "number") {
      overlay.startSec = el.start_sec;
    }
    if ("duration_sec" in el && typeof el.duration_sec === "number") {
      overlay.durationSec = el.duration_sec;
    }
    if ("opacity" in el && typeof el.opacity === "number") {
      overlay.opacity = el.opacity;
    }

    // Special handling for TRIM element to map startSec/durationSec
    if (el.type === "TRIM" && "startTime" in el && "endTime" in el) {
      if (typeof el.startTime === "number") {
        overlay.startSec = el.startTime;
        if (typeof el.endTime === "number") {
          overlay.durationSec = el.endTime - el.startTime;
        }
      }
    }

    return overlay;
  });

  // 5. Compile Effects
  const effects: RenderEffect[] = [];

  if (state.frameFilters) {
    effects.push({
      id: "effect-frame-filters",
      type: "frame_filter",
      payload: state.frameFilters as unknown as Record<string, unknown>,
    });
  }

  if (state.exportSettings) {
    effects.push({
      id: "effect-export-settings",
      type: "export_settings",
      payload: state.exportSettings as unknown as Record<string, unknown>,
    });
  }

  if (state.defaultTransition) {
    effects.push({
      id: "effect-default-transition",
      type: "default_transition",
      payload: { transition: state.defaultTransition },
    });
  }

  if (state.splitScreenPresetId !== undefined) {
    effects.push({
      id: "effect-split-screen",
      type: "split_screen",
      payload: { presetId: state.splitScreenPresetId },
    });
  }

  // 6. Compile Keyframes (none in current state)
  const keyframes: RenderKeyframe[] = [];

  return {
    version: 1,
    generatedAt: Date.now(),
    timeline,
    tracks,
    clips,
    captions,
    overlays,
    effects,
    keyframes,
  };
}

export function validateRenderManifest(manifest: RenderManifest): string[] {
  const errors: string[] = [];

  if (!manifest) {
    errors.push("Manifest is null or undefined");
    return errors;
  }

  if (manifest.version !== 1) {
    errors.push(`Invalid version: ${manifest.version}. Expected: 1`);
  }

  if (!manifest.timeline) {
    errors.push("Timeline metadata is missing");
  } else {
    if (!(manifest.timeline.width > 0)) {
      errors.push(`Invalid timeline width: ${manifest.timeline.width}`);
    }
    if (!(manifest.timeline.height > 0)) {
      errors.push(`Invalid timeline height: ${manifest.timeline.height}`);
    }
    if (!(manifest.timeline.fps > 0)) {
      errors.push(`Invalid timeline fps: ${manifest.timeline.fps}`);
    }
  }

  const arrayFields = ["tracks", "clips", "captions", "overlays", "effects", "keyframes"] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(manifest[field])) {
      errors.push(`Missing or invalid array field: ${field}`);
    }
  }

  if (Array.isArray(manifest.clips)) {
    manifest.clips.forEach((clip, index) => {
      if (!clip) {
        errors.push(`Clip at index ${index} is null or undefined`);
        return;
      }
      if (!clip.id) {
        errors.push(`Clip at index ${index} is missing id`);
      }
      if (!clip.sourceId) {
        errors.push(`Clip at index ${index} (${clip.id || "unknown"}) is missing sourceId`);
      }
      if (typeof clip.timelineStartSec !== "number" || isNaN(clip.timelineStartSec)) {
        errors.push(`Clip (${clip.id || index}) timelineStartSec must be a number`);
      }
      if (typeof clip.startSec !== "number" || isNaN(clip.startSec)) {
        errors.push(`Clip (${clip.id || index}) startSec must be a number`);
      }
      if (typeof clip.endSec !== "number" || isNaN(clip.endSec)) {
        errors.push(`Clip (${clip.id || index}) endSec must be a number`);
      }
    });
  }

  return errors;
}
