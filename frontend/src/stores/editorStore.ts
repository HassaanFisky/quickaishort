import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { RefObject } from "react";

import { Clip, Transcript, CutSegment } from "@/types/pipeline";
import {
  upsertKeyframe,
  deleteKeyframe as deleteKfById,
  getMotionPath,
  deleteMotionPath,
} from "@/lib/motion/keyframeStore";
import { Track, createDefaultTracks } from "@/types/timeline";
import { RenderManifest } from "@/lib/render/renderManifest";
import { compileRenderManifest, validateRenderManifest } from "@/lib/render/compileRenderManifest";

// ─── AI Editor Types ──────────────────────────────────────────────────────────

export interface VideoMetadata {
  id: string;
  url: string;
  title: string;
  duration: number;
  nativeWidth: number;
  nativeHeight: number;
  fps: number;
}

export interface CaptionStyle {
  fontSize: number;
  color: string;
  background: string;
  position: "top" | "middle" | "bottom";
  bold: boolean;
}

export interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: CaptionStyle;
}

export interface FrameFilter {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  chromaKeyEnabled?: boolean;
  chromaKeyColor?: string;
  chromaKeyTolerance?: number;
  chromaKeySoftness?: number;
  chromaKeySpill?: number;
  // Phase 34: Crop / Pan / Opacity / BG Remove
  cropTop?: number;
  cropBottom?: number;
  cropLeft?: number;
  cropRight?: number;
  panX?: number;
  panY?: number;
  opacity?: number;
  backgroundRemoveEnabled?: boolean;
}

export interface TrimMarker {
  startTime: number;
  endTime: number;
}

export interface EditorAction {
  type:
    // ─── Caption tools ───────────────────────────────────────────────────────
    | "ADD_CAPTION"         // { text, startTime, endTime, style? }
    | "REMOVE_CAPTION"      // { id }
    | "UPDATE_CAPTION"      // { id, patch }
    // ─── Clip tools ─────────────────────────────────────────────────────────
    | "TRIM"                // { start, end } — sets trimMarker + seeks
    | "SPLIT_CLIP"          // { time } — splits selected clip at time
    | "DELETE_CLIP"         // { id? } — deletes clip by id or selected clip
    | "SELECT_CLIP"         // { id?, index? } — selects a clip
    // ─── Visual tools ───────────────────────────────────────────────────────
    | "ADD_FILTER"          // { filter: "brightness"|"contrast"|"saturation"|"hue"|"blur", value }
    | "RESET_FILTER"        // {} — resets frame filters
    | "SET_VISUAL_FILTER"   // { filter: "None"|"Urban"|"Retro"|"Cinematic" }
    // ─── Audio tools ────────────────────────────────────────────────────────
    | "SET_AUDIO_BOOST"     // { value: 0-200 }
    | "SET_NOISE_REDUCTION" // { value: 0-100 }
    | "SET_PLAYBACK_SPEED"  // { value: 50-200 }
    // ─── Feature toggles ────────────────────────────────────────────────────
    | "TOGGLE_CAPTIONS"     // { enabled: boolean }
    | "TOGGLE_TRANSITIONS"  // { enabled: boolean }
    | "TOGGLE_VOICEOVER"    // { enabled: boolean }
    // ─── Playback ────────────────────────────────────────────────────────────
    | "SEEK"                // { time }
    | "PLAY"                // {}
    | "PAUSE"               // {}
    // ─── Pipeline ────────────────────────────────────────────────────────────
    | "EXPORT_CLIP"         // {} — fires qai:export event
    // ─── Pillar-1 element actions (payload envelope, see applyAiEdits) ───────
    | "ADD_ELEMENT"         // { element: Omit<EditorElement,"id"> }
    | "UPDATE_ELEMENT"      // { id, patch }
    | "REMOVE_ELEMENT"      // { id }
    // ─── Intelligent tool actions (surface suggestions, no direct edit) ──────
    | "DETECT_VIRAL_MOMENTS"  // { moments: AiViralMoment[] }
    | "GENERATE_HOOK_CAPTION" // { captions: string[] }
    | "SUGGEST_STYLE_PRESET"  // { preset, reason, actions }
    | "EXPLAIN_LAST_EDIT"     // { explanation, confidence }
    // ─── Phase 3a: B-Roll / Overlay actions ─────────────────────────────────
    | "ADD_BROLL"             // { pexels_id, download_url, thumbnail_url, title, start_sec, duration_sec, position, opacity }
    | "ADD_VIDEO_OVERLAY"     // { source_url, start_sec, duration_sec, position, opacity, mute_audio }
    | "REMOVE_OVERLAY"        // { element_id }
    | "BROLL_OPEN_LIBRARY"    // {} — UI-only: opens the B-roll drawer
    | "BROLL_CLEAR_ALL"       // {} — removes all BROLL elements
    | "REMOVE_SILENCES"       // { min_silence_sec, padding_sec } — trims leading/trailing silence
    // ─── Phase 4b: NLE Timeline Tools ───────────────────────────────────────
    | "POINTER_SELECT"        // { clip_id? } — activate pointer tool
    | "BLADE_SPLIT"           // { time_sec } — split all clips at time
    | "RIPPLE_TRIM"           // { clip_id, edge, delta_sec }
    | "ROLLING_TRIM"          // { clip_id, neighbor_id, edge, delta_sec }
    | "SLIP_CLIP"             // { clip_id, delta_sec } — shift source in/out
    | "SLIDE_CLIP"            // { clip_id, delta_sec } — move in timeline
    | "RIPPLE_DELETE"         // { clip_id } — delete + close gap
    | "DURATION_STRETCH"      // { clip_id, target_duration_sec?, speed_factor? }
    // ─── Phase 4b-wave-2: 14 additional NLE tools ───────────────────────────
    | "FORWARD_LANE_SELECT"   // { clip_id? }
    | "BACKWARD_LANE_SELECT"  // { clip_id? }
    | "MARK_IN"               // { time_sec }
    | "MARK_OUT"              // { time_sec }
    | "CLIP_RANGE_MARK"       // { clip_id }
    | "RANGE_MARK"            // { in_sec, out_sec }
    | "EXTRACT"               // { clip_id } — ripple remove
    | "LIFT"                  // { clip_id } — gap remove
    | "INSERT_EDIT"           // { clip_id, insert_time_sec }
    | "OVERWRITE_EDIT"        // { clip_id, insert_time_sec }
    | "SWAP_CLIP"             // { clip_id, target_clip_id }
    | "SCROLL_HAND"           // { delta_x?, delta_y? }
    | "TIMELINE_ZOOM"         // { zoom_factor }
    | "MAGNETIC_SNAP_TOGGLE"  // { enabled? }
    // ─── Phase 3b: Color Suite ───────────────────────────────────────────────
    | "COLOR_WHEELS"          // { clip_id, lift?, gamma?, gain?, offset? }
    | "COLOR_CURVES"          // { clip_id, master?, red?, green?, blue? }
    | "HSL_SECONDARIES"       // { clip_id, hue_shift?, saturation_adjust?, luminance_adjust? }
    | "APPLY_LUT"             // { clip_id, lut_url, lut_size?, intensity? }
    | "RESET_COLOR"           // { clip_id }
    // ─── Phase 5: Web Audio mix ──────────────────────────────────────────────
    | "SET_CLIP_GAIN"         // { clip_id, gain_db }
    | "SET_MASTER_GAIN"       // { gain_db }
    | "ENABLE_DENOISE"        // { clip_id, enabled }
    | "ENABLE_LIMITER"        // { enabled }
    | "ADD_FADE_IN"           // { clip_id, duration_ms }
    | "ADD_FADE_OUT"          // { clip_id, start_ms, duration_ms }
    // ─── Phase 6: Masking suite ──────────────────────────────────────────────
    | "ADD_RECT_MASK"         // { clip_id, x, y, width, height, feather?, invert? }
    | "ADD_ELLIPSE_MASK"      // { clip_id, cx, cy, rx, ry, rotation?, feather?, invert? }
    | "ADD_BEZIER_MASK"       // { clip_id, points, feather?, invert? }
    | "ADD_AI_PERSON_MASK"    // { clip_id, confidence?, invert? }
    | "CLEAR_MASKS"           // { clip_id }
    // ─── Phase 7: Motion keyframes ───────────────────────────────────────────
    | "SET_KEYFRAME"          // { clip_id, property, time_ms, value, easing? }
    | "DELETE_KEYFRAME"       // { clip_id, property, keyframe_id }
    | "CLEAR_KEYFRAMES"       // { clip_id }
    // ─── Phase 8: Project file ───────────────────────────────────────────────
    | "SAVE_PROJECT"          // { title? }
    | "LOAD_PROJECT"          // { project_id }
    // ─── Phase 9: Auto-reframe ───────────────────────────────────────────────
    | "AUTO_REFRAME"          // { clip_id, target_ar?, sample_rate_ms? }
    // ─── Phase 10: Voiceover, SFX, Transitions ──────────────────────────────
    | "ADD_VOICEOVER"         // { clip_id, start_sec?, duration_sec }
    | "ADD_SFX"               // { sfx_id, start_sec?, volume? }
    | "SET_TRANSITION"        // { clip_id, transition? }
    // ─── Phase 20: Chroma Key ───────────────────────────────────────────────
    | "ENABLE_CHROMA_KEY"        // { enabled: boolean }
    | "SET_CHROMA_KEY_COLOR"     // { color: string } — hex
    | "SET_CHROMA_KEY_TOLERANCE" // { value: number } — 0-1
    | "SET_CHROMA_KEY_SOFTNESS"  // { value: number } — 0-1
    | "SET_CHROMA_KEY_SPILL"     // { value: number } — 0-1
    // ─── Phase 21: Speed Ramp ────────────────────────────────────────────────
    | "SET_SPEED_KEYFRAME"       // { clip_id, time_ms, speed }
    | "DELETE_SPEED_KEYFRAME"    // { clip_id, time_ms }
    | "CLEAR_SPEED_RAMP"         // { clip_id }
    // ─── Phase 23: Quick-win actions ────────────────────────────────────────
    | "FREEZE_FRAME"             // { clip_id, time_sec }
    | "EXTEND_EDIT"              // { clip_id? }
    | "GOTO_TIMECODE"            // { timecode: string }
    | "TAG_AUDIO_CATEGORY"       // { clip_id, category }
    | "MATCH_FRAME"              // {}
    | "REVERSE_CLIP"             // { clip_id }
    | "SET_CLIP_COLOR_LABEL"     // { clip_id, color }
    // ─── Phase 24: Adjustment layers + audio ducking ─────────────────────────
    | "APPLY_FILTER_TO_ALL"      // { filter, value }
    | "ENABLE_AUDIO_DUCKING"     // { enabled, threshold?, reduction? }
    // ─── Phase 25: Grouping, auto-split, track matte ─────────────────────────
    | "GROUP_CLIPS"              // { clip_ids: string[] }
    | "AUTO_SPLIT_SCENES"        // { threshold? }
    | "SET_TRACK_MATTE"          // { clip_id, matte_clip_id }
    // ─── Phase 34: Crop / Pan / Opacity / BG Remove / Split Screen ───────────
    | "SET_CROP"                 // { top, bottom, left, right } — 0-1 fraction
    | "SET_PAN"                  // { x, y } — -1 to 1
    | "RESET_CROP_PAN"           // {} — resets crop + pan to zero
    | "SET_CLIP_OPACITY"         // { value: 0-1 }
    | "TOGGLE_BACKGROUND_REMOVE" // { enabled?: boolean }
    | "SET_SPLIT_SCREEN";        // { preset_id: string }
  payload: Record<string, unknown>;
}

export interface GeminiResponse {
  actions: EditorAction[];
  message: string;
  suggestions: string[];
}

export interface VideoAnalysis {
  scenes: { time: number; description: string }[];
  transcript: { text: string; startTime: number; endTime: number }[];
  topics: string[];
  suggestedEdits: string[];
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  actions?: EditorAction[];
}

const DEFAULT_FRAME_FILTERS: FrameFilter = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  chromaKeyEnabled: false,
  chromaKeyColor: "#00FF00",
  chromaKeyTolerance: 0.3,
  chromaKeySoftness: 0.1,
  chromaKeySpill: 0.5,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  panX: 0,
  panY: 0,
  opacity: 1,
  backgroundRemoveEnabled: false,
};

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontSize: 20,
  color: "#FFFFFF",
  background: "rgba(0,0,0,0.6)",
  position: "bottom",
  bold: false,
};

// ─── Pillar-1 Strict EditorElement Union ──────────────────────────────────────
// These types are the authoritative canvas element contract for the AI Editor.
// The older CanvasElement / canvasElements API below remains intact for
// CanvasLayer.tsx backward-compatibility.

export type EditorElementType = "TEXT" | "ZOOM" | "TRIM" | "STICKER" | "VIDEO_OVERLAY" | "BROLL";

export interface BaseEditorElement {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface TextElement extends BaseEditorElement {
  type: "TEXT";
  text: string;
  color: string;
  fontWeight?: number | string;
  fontSize?: number;
  className?: string;
}

export interface ZoomElement extends BaseEditorElement {
  type: "ZOOM";
  // Focal point the canvas zooms toward during playback
}

export interface TrimElement extends BaseEditorElement {
  type: "TRIM";
  startTime: number;
  endTime: number;
}

export interface StickerElement extends BaseEditorElement {
  type: "STICKER";
  emoji: string;
}

export type OverlayPosition =
  | "full"
  | "pip_tl" | "pip_tr" | "pip_bl" | "pip_br"
  | "split_left" | "split_right";

export interface VideoOverlayElement extends BaseEditorElement {
  type: "VIDEO_OVERLAY";
  source_url: string;
  start_sec: number;
  duration_sec: number;
  position: OverlayPosition;
  opacity: number;
  mute_audio: boolean;
}

export interface BRollElement extends BaseEditorElement {
  type: "BROLL";
  pexels_id: number;
  download_url: string;
  thumbnail_url: string;
  title: string;
  start_sec: number;
  duration_sec: number;
  position: OverlayPosition;
  opacity: number;
}

export type EditorElement =
  | TextElement
  | ZoomElement
  | TrimElement
  | StickerElement
  | VideoOverlayElement
  | BRollElement;

export type ToolId =
  | "pointer"
  | "blade"
  | "ripple"
  | "rolling"
  | "slip"
  | "slide"
  | "ripple-delete"
  | "duration-stretch"
  // Phase 4b-wave-2
  | "forward-lane"
  | "backward-lane"
  | "mark-in"
  | "mark-out"
  | "clip-range-mark"
  | "range-mark"
  | "extract"
  | "lift"
  | "insert-edit"
  | "overwrite-edit"
  | "swap-clip"
  | "scroll-hand"
  | "timeline-zoom"
  | "magnetic-snap";

export interface ClipColorState {
  exposure?: number;
  contrast?: number;
  saturation?: number;
  lift?: [number, number, number];
  gamma?: [number, number, number];
  gain?: [number, number, number];
  offset?: [number, number, number];
  hueShift?: number;
  satAdjust?: number;
  lumAdjust?: number;
  lutUrl?: string | null;
  lutIntensity?: number;
  masterCurve?: Array<[number, number]>;
}

export type AgentStatus = "idle" | "working" | "done" | "error";

export interface AgentState {
  status: AgentStatus;
  label: string;
  progress: number;
  message?: string;
  reasoningLogs?: string[];
}

export interface ExportSettings {
  quality: "low" | "medium" | "high";
  aspectRatio: "9:16" | "1:1";
  filter: "None" | "Urban" | "Retro" | "Cinematic";
  audioBoost: number;
  playbackSpeed: number;
  noiseSuppression: number;
  format: "mp4" | "webm";
  transitionEnabled: boolean;
  voiceoverEnabled: boolean;
}

export interface CanvasElementStyle {
  className?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  opacity?: number;
}

export interface CanvasElement {
  id: string;
  type: "text" | "image" | "sticker";
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  style?: CanvasElementStyle;
}

// ─── AI Suggestions (Pillar-3.7 intelligent tools) ───────────────────────────

export interface AiViralMoment {
  timestamp: number;
  hook: string;
  score: number;
}

export interface AiSuggestions {
  viralMoments: AiViralMoment[];
  hookCaptions: string[];
  stylePreset: { preset: string; reason: string } | null;
  lastEditExplanation: { explanation: string; confidence: string } | null;
}

const DEFAULT_AI_SUGGESTIONS: AiSuggestions = {
  viralMoments: [],
  hookCaptions: [],
  stylePreset: null,
  lastEditExplanation: null,
};

// ─── AI Undo Snapshot (Pillar-3) ──────────────────────────────────────────────
// Captures the full AI-mutable surface before any AI edit batch is applied.
export interface AiSnapshot {
  label: string;
  timestamp: number;
  elements: EditorElement[];
  selectedElementId: string | null;
  captions: Caption[];
  trimMarker: TrimMarker | null;
  frameFilters: FrameFilter;
  exportSettings: ExportSettings;
  captionsEnabled: boolean;
  currentTime: number;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: "red" | "green" | "blue" | "yellow" | "purple";
}

const _MAX_AI_STACK = 20;

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  quality: "medium",
  aspectRatio: "9:16",
  filter: "None",
  audioBoost: 85,
  playbackSpeed: 100,
  noiseSuppression: 20,
  format: "mp4",
  transitionEnabled: false,
  voiceoverEnabled: false,
};

// Per-session isolation id generator. Guarded for SSR / older runtimes that
// lack crypto.randomUUID (mirrors the addCanvasElement pattern below).
const genRunId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

interface EditorState {
  // Source Video
  sourceFile: File | null;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  sourceGcsPath: string | null;

  // YouTube IFrame clip selection (Tier-3/4 flow).
  // Set when user marks a clip range in the IFrame player.
  // Consumed by the backend /api/youtube/clip endpoint.
  ytVideoId: string | null;
  clipStartTime: number;
  clipEndTime: number;
  duration: number;
  resolution: { width: number; height: number } | null;

  // Per-session isolation id — minted fresh whenever a new source video loads,
  // so stale clips/analysis from a previous video never bleed into a new run.
  runId: string;

  // Processing State
  isProcessing: boolean;
  currentStage: "idle" | "loading" | "transcribing" | "analyzing" | "ready";
  progress: number;

  // ADK Agent Workforce State
  agentStates: {
    ingestion: AgentState;
    transcription: AgentState;
    viralAnalysis: AgentState;
    reframing: AgentState;
  };

  // Playback
  currentTime: number;
  isPlaying: boolean;
  pendingSeek: number | null;

  // Data
  transcript: Transcript | null;
  suggestions: Clip[];
  silenceSegments: CutSegment[];
  // 120 normalized amplitude values (0.01–1.0) pre-computed by useMediaPipeline
  // immediately after audio extraction using O(1)-per-bar stride sampling.
  // The raw Float32Array is never stored here — peaks are GC-eligible on extraction.
  waveformPeaks: number[] | null;
  captionsEnabled: boolean;
  selectedClipId: string | null;

  // Canvas Elements (Interactivity like PowerPoint/Canva)
  canvasElements: CanvasElement[];

  // ─── Pillar-1 Strict EditorElement API ────────────────────────────────────
  elements: EditorElement[];
  selectedElementId: string | null;
  lastAddedElementId: string | null;
  addElement: (el: Omit<EditorElement, "id">) => void;
  updateElement: (id: string, patch: Partial<EditorElement>) => void;
  removeElement: (id: string) => void;
  selectElement: (id: string | null) => void;

  // Export settings
  exportSettings: ExportSettings;

  // History for undo/redo
  undoStack: Clip[][];
  redoStack: Clip[][];

  // ─── AI-edit undo/redo stack (Pillar-3) ───────────────────────────────────
  aiUndoStack: AiSnapshot[];
  aiRedoStack: AiSnapshot[];

  // ─── AI intelligent tool suggestions (Pillar-3.7) ─────────────────────────
  aiSuggestions: AiSuggestions;

  // ─── Phase 3a: B-Roll drawer UI flag ──────────────────────────────────────
  isBRollDrawerOpen: boolean;
  setBRollDrawerOpen: (open: boolean) => void;

  // ─── Phase 4b: active timeline tool ───────────────────────────────────────
  activeTimelineTool: ToolId;
  setActiveTimelineTool: (tool: ToolId) => void;

  // ─── Phase 3b: color suite ────────────────────────────────────────────────
  clipColorState: ClipColorState | null;
  setClipColor: (patch: Partial<ClipColorState> | null) => void;

  // ─── Phase 6: masking suite ───────────────────────────────────────────────
  maskEnabled: boolean;
  setMaskEnabled: (enabled: boolean) => void;

  // Actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setPendingSeek: (time: number) => void;
  clearPendingSeek: () => void;
  setSourceFile: (file: File, url?: string) => void;
  setSourceUrl: (url: string) => void;
  setThumbnailUrl: (url: string | null) => void;
  setProcessing: (
    isProcessing: boolean,
    stage?: EditorState["currentStage"],
  ) => void;
  setAgentState: (
    agent: keyof EditorState["agentStates"],
    update: Partial<AgentState>,
  ) => void;
  setProgress: (progress: number) => void;
  setTranscript: (transcript: Transcript) => void;
  setSuggestions: (suggestions: Clip[]) => void;
  setSilenceSegments: (segments: CutSegment[]) => void;
  setWaveformPeaks: (peaks: number[] | null) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  selectClip: (id: string | null) => void;
  setYtVideoId: (id: string | null) => void;
  setClipRange: (startTime: number, endTime: number) => void;
  setSourceGcsPath: (path: string | null) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  rippleTrim: (clipId: string, edge: "in" | "out", deltaSec: number) => void;
  rollingTrim: (clipId: string, neighborId: string, edge: "in" | "out", deltaSec: number) => void;
  slipClip: (clipId: string, deltaSec: number) => void;
  slideClip: (clipId: string, deltaSec: number) => void;
  rippleDelete: (clipId: string) => void;
  setExportSetting: <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => void;
  
  // Canvas Actions
  addCanvasElement: (element: Omit<CanvasElement, "id">) => void;
  updateCanvasElement: (id: string, updates: Partial<CanvasElement>) => void;
  removeCanvasElement: (id: string) => void;

  splitClipAtTime: (time: number) => void;
  deleteClip: (id: string) => void;
  undo: () => void;
  redo: () => void;
  scriptPrompt: string;
  setScriptPrompt: (prompt: string) => void;
  reset: () => void;
  // Wipe per-video derived data + mint a fresh runId without clearing the source.
  resetForNewVideo: () => void;

  // ─── AI Editor State ───────────────────────────────────────────────────────
  videoMetadata: VideoMetadata | null;
  captions: Caption[];
  trimMarker: TrimMarker | null;
  frameFilters: FrameFilter;
  aiMessages: AIMessage[];
  isAIThinking: boolean;
  aiPanelOpen: boolean;
  videoAnalysis: VideoAnalysis | null;
  videoElementRef: RefObject<HTMLVideoElement> | null;

  // AI Editor Actions
  setVideoMetadata: (meta: VideoMetadata) => void;
  setTrimMarker: (m: TrimMarker | null) => void;
  setFrameFilter: (patch: Partial<FrameFilter>) => void;
  resetFrameFilters: () => void;
  addCaption: (c: Omit<Caption, "id" | "style"> & { style?: Partial<CaptionStyle> }) => string;
  removeCaption: (id: string) => void;
  updateCaption: (id: string, patch: Partial<Caption>) => void;
  addAIMessage: (msg: Omit<AIMessage, "id" | "timestamp">) => void;
  setAIThinking: (v: boolean) => void;
  setAIPanelOpen: (v: boolean) => void;
  setVideoAnalysis: (a: VideoAnalysis) => void;
  setVideoElementRef: (ref: RefObject<HTMLVideoElement>) => void;
  dispatchAIActions: (actions: EditorAction[]) => void;

  // ─── Pillar-3 AI edit batch apply + undo ─────────────────────────────────
  pushAiSnapshot: (label: string) => void;
  undoAiEdit: () => boolean;
  redoAiEdit: () => boolean;
  // Import type is forward-declared; implemented with AiEditorAction from ai-editor.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyAiEdits: (actions: any[], options?: { snapshotLabel?: string; seekToFirstEdit?: boolean }) => void;
  setAiSuggestions: (patch: Partial<AiSuggestions>) => void;
  clearAiSuggestions: () => void;
  markIn: number | null;
  markOut: number | null;
  setMarkIn: (t: number | null) => void;
  setMarkOut: (t: number | null) => void;
  clearMarks: () => void;
  timelineMarkers: TimelineMarker[];
  addTimelineMarker: (time: number, label?: string, color?: TimelineMarker["color"]) => void;
  removeTimelineMarker: (id: string) => void;
  clearTimelineMarkers: () => void;

  // ─── Phase 23: Track muting ─────────────────────────────────────────────────
  audioMuted: boolean;
  setAudioMuted: (v: boolean) => void;

  // ─── Phase 24: Audio ducking ─────────────────────────────────────────────────
  audioDucking: { enabled: boolean; threshold: number; reduction: number };
  setAudioDucking: (patch: Partial<{ enabled: boolean; threshold: number; reduction: number }>) => void;

  // ─── Phase 25: Clip grouping + project templates + track mattes ──────────────
  clipGroups: string[][];
  addClipGroup: (ids: string[]) => void;
  removeClipGroup: (groupIndex: number) => void;
  projectTemplate: string | null;
  setProjectTemplate: (t: string | null) => void;
  trackMattes: Record<string, string>;

  // ─── Phase 34: Default transition + split screen ──────────────────────────
  defaultTransition: string;
  setDefaultTransition: (name: string) => void;
  splitScreenPresetId: string | null;
  setSplitScreenPreset: (id: string | null) => void;

  // ─── Phase 36: Multi-track timeline data model ─────────────────────────────
  // Runs in parallel with the flat `suggestions[]` array — no breaking changes.
  tracks: Track[];
  addTrack: (type: "video" | "audio") => void;
  removeTrack: (trackId: string) => void;
  setTrackLocked: (trackId: string, locked: boolean) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;

  // ─── Phase 51: RenderManifest v1 + AI Transaction Layer ──────────────────
  timelineRevision: number;
  compiledManifest: RenderManifest | null;
  rebuildRenderManifest: () => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      sourceFile: null,
      sourceUrl: null,
      thumbnailUrl: null,
      sourceGcsPath: null,
      ytVideoId: null,
      clipStartTime: 0,
      clipEndTime: 0,
      duration: 0,
      resolution: null,
      runId: genRunId(),
      isProcessing: false,
      currentStage: "idle",
      progress: 0,

      agentStates: {
        ingestion: { status: "idle", label: "Downloading Video", progress: 0 },
        transcription: { status: "idle", label: "Creating Subtitles", progress: 0 },
        viralAnalysis: { status: "idle", label: "Analyzing Viral Potential", progress: 0 },
        reframing: { status: "idle", label: "Optimizing Format", progress: 0 },
      },

      currentTime: 0,
      isPlaying: false,
      pendingSeek: null,
      transcript: null,
      suggestions: [],
      silenceSegments: [],
      waveformPeaks: null,
      captionsEnabled: true,
      selectedClipId: null,
      canvasElements: [],
      exportSettings: { ...DEFAULT_EXPORT_SETTINGS },

      // Pillar-1 strict element API
      elements: [],
      selectedElementId: null,
      lastAddedElementId: null,

      scriptPrompt: "Write a high-engagement, viral-ready script for this clip.",
      undoStack: [],
      redoStack: [],

      // Pillar-3 AI undo stacks
      aiUndoStack: [],
      aiRedoStack: [],

      // Pillar-3.7 AI suggestions
      aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },

      markIn: null,
      markOut: null,
      timelineMarkers: [],

      // Phase 3a B-Roll drawer
      isBRollDrawerOpen: false,

      // Phase 4b active timeline tool
      activeTimelineTool: "pointer" as ToolId,

      // Phase 3b color suite
      clipColorState: null,

      // Phase 6 masking
      maskEnabled: false,

      // Phase 23
      audioMuted: false,

      // Phase 24
      audioDucking: { enabled: false, threshold: -20, reduction: 0.5 },

      // Phase 25
      clipGroups: [],
      projectTemplate: null,
      trackMattes: {},

      // Phase 34
      defaultTransition: "fade",
      splitScreenPresetId: null,

      // Phase 36
      tracks: createDefaultTracks(),

      // Phase 51
      timelineRevision: 0,
      compiledManifest: null,

      // AI Editor initial state
      videoMetadata: null,
      captions: [],
      trimMarker: null,
      frameFilters: { ...DEFAULT_FRAME_FILTERS },
      aiMessages: [],
      isAIThinking: false,
      aiPanelOpen: false,
      videoAnalysis: null,
      videoElementRef: null,

      setScriptPrompt: (prompt) => set({ scriptPrompt: prompt }),

      setCurrentTime: (time) => set({ currentTime: time }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setDuration: (duration) => set({ duration }),
      setPendingSeek: (time) => set({ pendingSeek: time }),
      clearPendingSeek: () => set({ pendingSeek: null }),

      setSourceFile: (file, url) =>
        set({
          sourceFile: file,
          sourceUrl: url || URL.createObjectURL(file),
          currentStage: "loading",
          // O6: isolate the new video — drop derived data from any prior run.
          runId: genRunId(),
          suggestions: [],
          captions: [],
          transcript: null,
          silenceSegments: [],
          waveformPeaks: null,
          videoAnalysis: null,
          selectedClipId: null,
          canvasElements: [],
          elements: [],
          selectedElementId: null,
          lastAddedElementId: null,
          trimMarker: null,
          undoStack: [],
          redoStack: [],
          aiUndoStack: [],
          aiRedoStack: [],
          aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },
          progress: 0,
        }),

      setSourceUrl: (url) =>
        set({
          sourceUrl: url,
          currentStage: "loading",
          // O6: isolate the new video — drop derived data from any prior run.
          runId: genRunId(),
          suggestions: [],
          captions: [],
          transcript: null,
          silenceSegments: [],
          waveformPeaks: null,
          videoAnalysis: null,
          selectedClipId: null,
          canvasElements: [],
          elements: [],
          selectedElementId: null,
          lastAddedElementId: null,
          trimMarker: null,
          undoStack: [],
          redoStack: [],
          aiUndoStack: [],
          aiRedoStack: [],
          aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },
          progress: 0,
        }),

      setThumbnailUrl: (url) => set({ thumbnailUrl: url }),

      setProcessing: (isProcessing, stage) =>
        set((state) => ({
          isProcessing,
          currentStage: stage || state.currentStage,
        })),

      setAgentState: (agent, update) =>
        set((state) => ({
          agentStates: {
            ...state.agentStates,
            [agent]: { ...state.agentStates[agent], ...update },
          },
        })),

      setProgress: (progress) => set({ progress }),

      setTranscript: (transcript) => set({ transcript }),

      setSuggestions: (suggestions) => set({ suggestions }),
      setSilenceSegments: (segments) => set({ silenceSegments: segments }),
      setWaveformPeaks: (peaks) => set({ waveformPeaks: peaks }),
      setCaptionsEnabled: (enabled) => set({ captionsEnabled: enabled }),
      selectClip: (id) => set({ selectedClipId: id }),
      setYtVideoId: (id) => set({ ytVideoId: id }),
      setClipRange: (startTime, endTime) => set({ clipStartTime: startTime, clipEndTime: endTime }),
      setSourceGcsPath: (path) => set({ sourceGcsPath: path }),

      updateClip: (id, updates) =>
        set((state) => ({
          suggestions: state.suggestions.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
        })),

      rippleTrim: (clipId, edge, deltaSec) =>
        set((state) => {
          const sorted = [...state.suggestions].sort((a, b) => a.start - b.start);
          const idx = sorted.findIndex((c) => c.id === clipId);
          if (idx === -1) return {};
          const clip = sorted[idx];
          let actualDelta: number;
          if (edge === "out") {
            const newEnd = Math.max(clip.start + 0.1, Math.min(state.duration, clip.end + deltaSec));
            actualDelta = newEnd - clip.end;
            sorted[idx] = { ...clip, end: newEnd, outPoint: (clip.outPoint ?? clip.end) + actualDelta };
            for (let i = idx + 1; i < sorted.length; i++) {
              sorted[i] = { ...sorted[i], start: sorted[i].start + actualDelta, end: sorted[i].end + actualDelta };
            }
          } else {
            const newStart = Math.max(0, Math.min(clip.end - 0.1, clip.start + deltaSec));
            actualDelta = newStart - clip.start;
            sorted[idx] = { ...clip, start: newStart, inPoint: Math.max(0, (clip.inPoint ?? clip.start) + actualDelta) };
            for (let i = idx + 1; i < sorted.length; i++) {
              sorted[i] = { ...sorted[i], start: sorted[i].start - actualDelta, end: sorted[i].end - actualDelta };
            }
          }
          return { undoStack: [...state.undoStack.slice(-49), [...state.suggestions]], redoStack: [], suggestions: sorted };
        }),

      rollingTrim: (clipId, neighborId, edge, deltaSec) =>
        set((state) => {
          const clips = state.suggestions.map((c) => ({ ...c }));
          const clipIdx = clips.findIndex((c) => c.id === clipId);
          const neighborIdx = clips.findIndex((c) => c.id === neighborId);
          if (clipIdx === -1 || neighborIdx === -1) return {};
          const clip = clips[clipIdx];
          const neighbor = clips[neighborIdx];
          if (edge === "out") {
            const newEnd = Math.max(clip.start + 0.1, Math.min(neighbor.end - 0.1, clip.end + deltaSec));
            const d = newEnd - clip.end;
            clips[clipIdx] = { ...clip, end: newEnd, outPoint: (clip.outPoint ?? clip.end) + d };
            clips[neighborIdx] = { ...neighbor, start: neighbor.start + d, inPoint: Math.max(0, (neighbor.inPoint ?? neighbor.start) + d) };
          } else {
            const newStart = Math.max(neighbor.start + 0.1, Math.min(clip.end - 0.1, clip.start + deltaSec));
            const d = newStart - clip.start;
            clips[neighborIdx] = { ...neighbor, end: neighbor.end + d, outPoint: (neighbor.outPoint ?? neighbor.end) + d };
            clips[clipIdx] = { ...clip, start: newStart, inPoint: Math.max(0, (clip.inPoint ?? clip.start) + d) };
          }
          return { undoStack: [...state.undoStack.slice(-49), [...state.suggestions]], redoStack: [], suggestions: clips };
        }),

      slipClip: (clipId, deltaSec) =>
        set((state) => {
          const suggestions = state.suggestions.map((c) => {
            if (c.id !== clipId) return c;
            const duration = c.end - c.start;
            const newIn = Math.max(0, (c.inPoint ?? c.start) + deltaSec);
            return { ...c, inPoint: newIn, outPoint: newIn + duration };
          });
          return { undoStack: [...state.undoStack.slice(-49), [...state.suggestions]], redoStack: [], suggestions };
        }),

      slideClip: (clipId, deltaSec) =>
        set((state) => {
          const sorted = [...state.suggestions].sort((a, b) => a.start - b.start);
          const idx = sorted.findIndex((c) => c.id === clipId);
          if (idx === -1) return {};
          const clip = sorted[idx];
          const duration = clip.end - clip.start;
          const prev = idx > 0 ? sorted[idx - 1] : null;
          const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
          const prevDuration = prev ? (prev.outPoint ?? prev.end) - (prev.inPoint ?? prev.start) : 0;
          const nextDuration = next ? (next.outPoint ?? next.end) - (next.inPoint ?? next.start) : 0;
          const minStart = prev ? clip.start - (prevDuration - 0.1) : 0;
          const maxStart = next ? clip.start + (nextDuration - 0.1) : Infinity;
          const newStart = Math.max(minStart, Math.min(maxStart, clip.start + deltaSec));
          const d = newStart - clip.start;
          if (d === 0) return {};
          sorted[idx] = { ...clip, start: newStart, end: newStart + duration };
          if (prev !== null) {
            sorted[idx - 1] = { ...prev, end: prev.end + d, outPoint: (prev.outPoint ?? prev.end) + d };
          }
          if (next !== null) {
            sorted[idx + 1] = { ...next, start: next.start + d, inPoint: Math.max(0, (next.inPoint ?? next.start) + d) };
          }
          return { undoStack: [...state.undoStack.slice(-49), [...state.suggestions]], redoStack: [], suggestions: sorted };
        }),

      rippleDelete: (clipId) =>
        set((state) => {
          const clip = state.suggestions.find((c) => c.id === clipId);
          if (!clip) return {};
          const gapSize = clip.end - clip.start;
          const suggestions = state.suggestions
            .filter((c) => c.id !== clipId)
            .map((c) => c.start >= clip.end ? { ...c, start: c.start - gapSize, end: c.end - gapSize } : c);
          return {
            undoStack: [...state.undoStack.slice(-49), [...state.suggestions]],
            redoStack: [],
            suggestions,
            selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
          };
        }),

      splitClipAtTime: (time) =>
        set((state) => {
          const { selectedClipId, suggestions } = state;
          const clip = selectedClipId
            ? suggestions.find((c) => c.id === selectedClipId)
            : suggestions[0];

          // Guard: time must be inside the clip bounds with at least 1s on each side
          if (!clip || time <= clip.start + 1 || time >= clip.end - 1) return {};

          const idx = suggestions.findIndex((c) => c.id === clip.id);
          const idA = `${clip.id}-a`;
          const idB = `${clip.id}-b`;

          const clipA: typeof clip = {
            ...clip,
            id: idA,
            end: time,
          };
          const clipB: typeof clip = {
            ...clip,
            id: idB,
            start: time,
          };

          const next = [...suggestions];
          next.splice(idx, 1, clipA, clipB);

          return {
            undoStack: [...state.undoStack.slice(-49), [...suggestions]],
            redoStack: [],
            suggestions: next,
            selectedClipId: idA,
          };
        }),

      deleteClip: (id) =>
        set((state) => ({
          undoStack: [...state.undoStack.slice(-49), [...state.suggestions]],
          redoStack: [],
          suggestions: state.suggestions.filter((c) => c.id !== id),
          selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
        })),

      undo: () =>
        set((state) => {
          if (state.undoStack.length === 0) return {};
          const prev = state.undoStack[state.undoStack.length - 1];
          return {
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, [...state.suggestions]],
            suggestions: prev,
          };
        }),

      redo: () =>
        set((state) => {
          if (state.redoStack.length === 0) return {};
          const next = state.redoStack[state.redoStack.length - 1];
          return {
            redoStack: state.redoStack.slice(0, -1),
            undoStack: [...state.undoStack, [...state.suggestions]],
            suggestions: next,
          };
        }),

      setExportSetting: (key, value) =>
        set((state) => ({
          exportSettings: { ...state.exportSettings, [key]: value },
        })),

      addCanvasElement: (element) =>
        set((state) => ({
          canvasElements: [
            ...state.canvasElements,
            { 
              ...element, 
              id: typeof crypto !== "undefined" && crypto.randomUUID 
                ? crypto.randomUUID() 
                : Math.random().toString(36).substring(2, 15) 
            },
          ],
        })),

      updateCanvasElement: (id, updates) =>
        set((state) => ({
          canvasElements: state.canvasElements.map((el) =>
            el.id === id ? { ...el, ...updates } : el,
          ),
        })),

      removeCanvasElement: (id) =>
        set((state) => ({
          canvasElements: state.canvasElements.filter((el) => el.id !== id),
        })),

      // ─── Pillar-1 Strict EditorElement actions ────────────────────────────
      addElement: (el) => {
        const id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 15);
        const full = { ...el, id } as EditorElement;
        set((state) => ({
          elements: [...state.elements, full],
          lastAddedElementId: id,
          selectedElementId: id,
        }));
      },

      updateElement: (id, patch) =>
        set((state) => ({
          elements: state.elements.map((el) =>
            el.id === id ? ({ ...el, ...patch, type: el.type, id: el.id } as EditorElement) : el,
          ),
        })),

      removeElement: (id) =>
        set((state) => ({
          elements: state.elements.filter((el) => el.id !== id),
          selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
          lastAddedElementId: state.lastAddedElementId === id ? null : state.lastAddedElementId,
        })),

      selectElement: (id) => set({ selectedElementId: id }),

      // ─── AI Editor Actions ─────────────────────────────────────────────────
      setVideoMetadata: (meta) => set({ videoMetadata: meta }),
      setTrimMarker: (m) => set({ trimMarker: m }),

      setFrameFilter: (patch) =>
        set((state) => ({ frameFilters: { ...state.frameFilters, ...patch } })),

      resetFrameFilters: () => set({ frameFilters: { ...DEFAULT_FRAME_FILTERS } }),

      addCaption: (c) => {
        const id = crypto.randomUUID();
        set((state) => {
          const updated = [
            ...state.captions,
            { id, text: c.text, startTime: c.startTime, endTime: c.endTime, style: { ...DEFAULT_CAPTION_STYLE, ...(c.style || {}) } },
          ].sort((a, b) => a.startTime - b.startTime);
          return { captions: updated };
        });
        return id;
      },

      removeCaption: (id) =>
        set((state) => ({ captions: state.captions.filter((c) => c.id !== id) })),

      updateCaption: (id, patch) =>
        set((state) => ({
          captions: state.captions.map((c) => c.id === id ? { ...c, ...patch } : c),
        })),

      addAIMessage: (msg) =>
        set((state) => ({
          aiMessages: [...state.aiMessages, { id: crypto.randomUUID(), timestamp: Date.now(), ...msg }],
        })),

      setAIThinking: (v) => set({ isAIThinking: v }),
      setAIPanelOpen: (v) => set({ aiPanelOpen: v }),
      setVideoAnalysis: (a) => set({ videoAnalysis: a }),
      setVideoElementRef: (ref) => set({ videoElementRef: ref }),

      dispatchAIActions: (actions) => {
        const store = useEditorStore.getState();
        const videoEl = store.videoElementRef?.current;

        actions.forEach((action) => {
          switch (action.type) {

            // ── Caption tools ─────────────────────────────────────────────
            case "ADD_CAPTION":
              store.addCaption({
                text: action.payload.text as string,
                startTime: action.payload.startTime as number,
                endTime: action.payload.endTime as number,
                style: action.payload.style as Partial<CaptionStyle> | undefined,
              });
              break;
            case "REMOVE_CAPTION":
              store.removeCaption(action.payload.id as string);
              break;
            case "UPDATE_CAPTION":
              store.updateCaption(action.payload.id as string, action.payload.patch as Partial<Caption>);
              break;

            // ── Clip tools ────────────────────────────────────────────────
            case "TRIM":
              store.setTrimMarker({
                startTime: action.payload.start as number,
                endTime: action.payload.end as number,
              });
              if (videoEl) videoEl.currentTime = action.payload.start as number;
              break;
            case "SPLIT_CLIP": {
              const splitTime = action.payload.time as number;
              if (typeof splitTime === "number") store.splitClipAtTime(splitTime);
              break;
            }
            case "DELETE_CLIP": {
              const targetId = (action.payload.id as string | undefined) || store.selectedClipId;
              if (targetId) store.deleteClip(targetId);
              break;
            }
            case "SELECT_CLIP": {
              if (action.payload.id) {
                store.selectClip(action.payload.id as string);
              } else if (typeof action.payload.index === "number") {
                const clip = store.suggestions[action.payload.index as number];
                if (clip) store.selectClip(clip.id);
              }
              break;
            }

            // ── Visual tools ─────────────────────────────────────────────
            case "ADD_FILTER":
              store.setFrameFilter({
                [action.payload.filter as string]: action.payload.value as number,
              });
              break;
            case "RESET_FILTER":
              store.resetFrameFilters();
              break;
            case "SET_VISUAL_FILTER":
              store.setExportSetting(
                "filter",
                action.payload.filter as ExportSettings["filter"],
              );
              break;

            // ── Audio tools ──────────────────────────────────────────────
            case "SET_AUDIO_BOOST": {
              const v = Math.max(0, Math.min(200, action.payload.value as number));
              store.setExportSetting("audioBoost", v);
              break;
            }
            case "SET_NOISE_REDUCTION": {
              const v = Math.max(0, Math.min(100, action.payload.value as number));
              store.setExportSetting("noiseSuppression", v);
              break;
            }
            case "SET_PLAYBACK_SPEED": {
              const v = Math.max(50, Math.min(200, action.payload.value as number));
              store.setExportSetting("playbackSpeed", v);
              if (videoEl) videoEl.playbackRate = v / 100;
              break;
            }

            // ── Feature toggles ──────────────────────────────────────────
            case "TOGGLE_CAPTIONS":
              store.setCaptionsEnabled(action.payload.enabled as boolean);
              break;
            case "TOGGLE_TRANSITIONS":
              store.setExportSetting("transitionEnabled", action.payload.enabled as boolean);
              break;
            case "TOGGLE_VOICEOVER":
              store.setExportSetting("voiceoverEnabled", action.payload.enabled as boolean);
              break;

            // ── Playback ─────────────────────────────────────────────────
            case "SEEK":
              if (videoEl) videoEl.currentTime = action.payload.time as number;
              break;
            case "PLAY":
              if (videoEl) videoEl.play().catch(() => {});
              store.setIsPlaying(true);
              break;
            case "PAUSE":
              if (videoEl) videoEl.pause();
              store.setIsPlaying(false);
              break;

            // ── Pipeline ─────────────────────────────────────────────────
            case "EXPORT_CLIP":
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("qai:export"));
              }
              break;

            // ── Pillar-1 element actions ──────────────────────────────────
            // Option A: applyAiEdits wraps the wire format in payload before
            // calling dispatchAIActions, so these cases read from payload.
            case "ADD_ELEMENT": {
              const el = action.payload.element as Omit<EditorElement, "id">;
              if (el && typeof el.type === "string") store.addElement(el);
              break;
            }
            case "UPDATE_ELEMENT": {
              const id = action.payload.id as string;
              const patch = action.payload.patch as Partial<EditorElement>;
              if (id && patch) store.updateElement(id, patch);
              break;
            }
            case "REMOVE_ELEMENT": {
              const id = action.payload.id as string;
              if (id) store.removeElement(id);
              break;
            }

            // ── Intelligent tool actions ──────────────────────────────────────
            case "DETECT_VIRAL_MOMENTS": {
              const moments = action.payload.moments as AiViralMoment[];
              store.setAiSuggestions({ viralMoments: moments ?? [] });
              break;
            }
            case "GENERATE_HOOK_CAPTION": {
              const captions = action.payload.captions as string[];
              store.setAiSuggestions({ hookCaptions: captions ?? [] });
              break;
            }
            case "SUGGEST_STYLE_PRESET": {
              const preset = action.payload.preset as string;
              const reason = action.payload.reason as string;
              store.setAiSuggestions({ stylePreset: { preset, reason } });
              // Apply the nested preset actions via the dispatcher
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const nestedActions = action.payload.actions as any[];
              if (nestedActions?.length) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const nestedTranslated: EditorAction[] = nestedActions.map((a: any) => {
                  const { type: t, ...rest } = a;
                  return { type: t, payload: rest } as EditorAction;
                });
                store.dispatchAIActions(nestedTranslated);
              }
              break;
            }
            case "EXPLAIN_LAST_EDIT": {
              const explanation = action.payload.explanation as string;
              const confidence = action.payload.confidence as string;
              store.setAiSuggestions({ lastEditExplanation: { explanation, confidence } });
              break;
            }

            // ── Phase 3a: B-Roll / Overlay actions ───────────────────────────
            case "ADD_BROLL": {
              const p = action.payload;
              store.addElement({
                type: "BROLL",
                pexels_id: p.pexels_id as number,
                download_url: p.download_url as string,
                thumbnail_url: p.thumbnail_url as string,
                title: (p.title as string) ?? "",
                start_sec: p.start_sec as number,
                duration_sec: p.duration_sec as number,
                position: p.position as OverlayPosition,
                opacity: p.opacity as number,
                x: 0, y: 0, scale: 1, rotation: 0,
              } as Omit<BRollElement, "id">);
              break;
            }
            case "ADD_VIDEO_OVERLAY": {
              const p = action.payload;
              store.addElement({
                type: "VIDEO_OVERLAY",
                source_url: p.source_url as string,
                start_sec: p.start_sec as number,
                duration_sec: p.duration_sec as number,
                position: p.position as OverlayPosition,
                opacity: p.opacity as number,
                mute_audio: (p.mute_audio as boolean) ?? true,
                x: 0, y: 0, scale: 1, rotation: 0,
              } as Omit<VideoOverlayElement, "id">);
              break;
            }
            case "REMOVE_OVERLAY": {
              const id = action.payload.element_id as string;
              if (id) store.removeElement(id);
              break;
            }
            case "BROLL_OPEN_LIBRARY": {
              store.setBRollDrawerOpen(true);
              break;
            }
            case "BROLL_CLEAR_ALL": {
              const brollIds = store.elements
                .filter((el) => el.type === "BROLL")
                .map((el) => el.id);
              brollIds.forEach((id) => store.removeElement(id));
              break;
            }
            case "REMOVE_SILENCES": {
              const p = action.payload;
              const paddingSec = (p.padding_sec as number) ?? 0.08;
              const { transcript, duration } = store;
              if (!transcript?.chunks?.length || duration === 0) break;
              const chunks = [...transcript.chunks].sort((a, b) => a.start - b.start);
              const trimStart = Math.max(0, chunks[0].start - paddingSec);
              const trimEnd = Math.min(duration, chunks[chunks.length - 1].end + paddingSec);
              // 80 % safety rail — don't remove more than 80 % of the video
              if ((trimEnd - trimStart) < duration * 0.2) break;
              store.setTrimMarker({ startTime: trimStart, endTime: trimEnd });
              if (videoEl) videoEl.currentTime = trimStart;
              break;
            }

            // ─── Phase 4b: NLE Timeline Tools ────────────────────────────────
            case "POINTER_SELECT": {
              const clipId = action.payload.clip_id as string | undefined;
              store.setActiveTimelineTool("pointer");
              if (clipId) store.selectClip(clipId);
              break;
            }
            case "BLADE_SPLIT": {
              const timeSec = action.payload.time_sec as number;
              store.setActiveTimelineTool("blade");
              if (typeof timeSec === "number" && store.suggestions.length > 0) {
                store.splitClipAtTime(timeSec);
              }
              break;
            }
            case "RIPPLE_TRIM": {
              store.setActiveTimelineTool("ripple");
              store.rippleTrim(
                action.payload.clip_id as string,
                action.payload.edge as "in" | "out",
                (action.payload.delta_sec as number) ?? 0,
              );
              break;
            }
            case "ROLLING_TRIM": {
              store.setActiveTimelineTool("rolling");
              store.rollingTrim(
                action.payload.clip_id as string,
                action.payload.neighbor_id as string,
                action.payload.edge as "in" | "out",
                (action.payload.delta_sec as number) ?? 0,
              );
              break;
            }
            case "SLIP_CLIP": {
              store.setActiveTimelineTool("slip");
              const slipClipId = action.payload.clip_id as string;
              const slipDelta = (action.payload.delta_sec as number) ?? 0;
              const slipTarget = store.suggestions.find((c) => c.id === slipClipId);
              if (slipTarget) {
                const newIn = Math.max(0, (slipTarget.inPoint ?? slipTarget.start) + slipDelta);
                store.slipClip(slipClipId, slipDelta);
                store.setPendingSeek(newIn);
              }
              break;
            }
            case "SLIDE_CLIP": {
              store.setActiveTimelineTool("slide");
              store.slideClip(
                action.payload.clip_id as string,
                (action.payload.delta_sec as number) ?? 0,
              );
              break;
            }
            case "RIPPLE_DELETE": {
              store.setActiveTimelineTool("ripple-delete");
              const rdClipId = action.payload.clip_id as string;
              if (rdClipId) store.rippleDelete(rdClipId);
              break;
            }
            case "DURATION_STRETCH": {
              store.setActiveTimelineTool("duration-stretch");
              const speedFactor = action.payload.speed_factor as number | undefined;
              if (speedFactor != null) {
                // Map speed_factor to playbackSpeed percentage (1.0 → 100, 2.0 → 200)
                const pct = Math.round(Math.max(50, Math.min(200, speedFactor * 100)));
                store.setExportSetting("playbackSpeed", pct);
              }
              break;
            }
            // ─── Phase 4b-wave-2 dispatcher cases ──────────────────────────
            case "FORWARD_LANE_SELECT":
              store.setActiveTimelineTool("forward-lane");
              break;
            case "BACKWARD_LANE_SELECT":
              store.setActiveTimelineTool("backward-lane");
              break;
            case "MARK_IN":
              store.setActiveTimelineTool("mark-in");
              store.setPendingSeek(action.payload.time_sec as number);
              break;
            case "MARK_OUT":
              store.setActiveTimelineTool("mark-out");
              store.setPendingSeek(action.payload.time_sec as number);
              break;
            case "CLIP_RANGE_MARK":
              store.setActiveTimelineTool("clip-range-mark");
              break;
            case "RANGE_MARK":
              store.setActiveTimelineTool("range-mark");
              break;
            case "EXTRACT": {
              store.setActiveTimelineTool("extract");
              const exClipId = action.payload.clip_id as string;
              if (exClipId) store.deleteClip(exClipId);
              break;
            }
            case "LIFT": {
              store.setActiveTimelineTool("lift");
              const liftClipId = action.payload.clip_id as string;
              if (liftClipId) store.deleteClip(liftClipId);
              break;
            }
            case "INSERT_EDIT":
              store.setActiveTimelineTool("insert-edit");
              store.setPendingSeek(action.payload.insert_time_sec as number);
              break;
            case "OVERWRITE_EDIT":
              store.setActiveTimelineTool("overwrite-edit");
              store.setPendingSeek(action.payload.insert_time_sec as number);
              break;
            case "SWAP_CLIP":
              store.setActiveTimelineTool("swap-clip");
              break;
            case "SCROLL_HAND":
              store.setActiveTimelineTool("scroll-hand");
              break;
            case "TIMELINE_ZOOM":
              store.setActiveTimelineTool("timeline-zoom");
              break;
            case "MAGNETIC_SNAP_TOGGLE":
              store.setActiveTimelineTool("magnetic-snap");
              break;
            case "COLOR_WHEELS":
            case "COLOR_CURVES":
            case "HSL_SECONDARIES":
              store.setClipColor({
                ...(action.payload.hue_shift !== undefined && { hueShift: action.payload.hue_shift as number }),
                ...(action.payload.saturation_adjust !== undefined && { satAdjust: action.payload.saturation_adjust as number }),
                ...(action.payload.luminance_adjust !== undefined && { lumAdjust: action.payload.luminance_adjust as number }),
              });
              break;
            case "APPLY_LUT":
              store.setClipColor({
                lutUrl: action.payload.lut_url as string,
                lutIntensity: (action.payload.intensity as number | undefined) ?? 1,
              });
              break;
            case "RESET_COLOR":
              store.setClipColor(null);
              break;
            case "SET_CLIP_GAIN":
              // Stored in clipColorState for display; actual AudioParam update
              // is handled by MixGraph in the audio layer
              break;
            case "SET_MASTER_GAIN":
              break;
            case "ENABLE_DENOISE":
              break;
            case "ENABLE_LIMITER":
              break;
            case "ADD_FADE_IN":
              break;
            case "ADD_FADE_OUT":
              break;
            case "ADD_RECT_MASK":
            case "ADD_ELLIPSE_MASK":
            case "ADD_BEZIER_MASK":
            case "ADD_AI_PERSON_MASK":
              store.setMaskEnabled(true);
              break;
            case "CLEAR_MASKS":
              store.setMaskEnabled(false);
              break;
            // ─── Phase 7: Motion keyframes ─────────────────────────────────
            case "SET_KEYFRAME":
              break;
            case "DELETE_KEYFRAME":
              break;
            case "CLEAR_KEYFRAMES":
              break;
            // ─── Phase 8: Project file ─────────────────────────────────────
            case "SAVE_PROJECT":
              break;
            case "LOAD_PROJECT":
              break;
            // ─── Phase 9: Auto-reframe ──────────────────────────────────────
            case "AUTO_REFRAME":
              break;
            // ─── Phase 10: Voiceover / SFX / Transitions ───────────────────
            case "ADD_VOICEOVER":
              break;
            case "ADD_SFX":
              break;
            case "SET_TRANSITION":
              break;
            // ─── Phase 20: Chroma Key ──────────────────────────────────────────
            case "ENABLE_CHROMA_KEY":
              store.setFrameFilter({ chromaKeyEnabled: action.payload.enabled as boolean });
              break;
            case "SET_CHROMA_KEY_COLOR":
              store.setFrameFilter({ chromaKeyColor: action.payload.color as string });
              break;
            case "SET_CHROMA_KEY_TOLERANCE":
              store.setFrameFilter({ chromaKeyTolerance: action.payload.value as number });
              break;
            case "SET_CHROMA_KEY_SOFTNESS":
              store.setFrameFilter({ chromaKeySoftness: action.payload.value as number });
              break;
            case "SET_CHROMA_KEY_SPILL":
              store.setFrameFilter({ chromaKeySpill: action.payload.value as number });
              break;
            // ─── Phase 21: Speed Ramp ──────────────────────────────────────
            case "SET_SPEED_KEYFRAME": {
              const spClipId = action.payload.clip_id as string;
              const spTimeMs = action.payload.time_ms as number;
              const spSpeed  = action.payload.speed as number;
              if (!spClipId || spTimeMs == null || spSpeed == null) break;
              upsertKeyframe(spClipId, "speed", {
                id: `speed-${spTimeMs}`,
                timeMs: spTimeMs,
                value: Math.max(0.25, Math.min(4.0, spSpeed)),
                easing: { type: "ease-in-out" },
              });
              break;
            }
            case "DELETE_SPEED_KEYFRAME": {
              const dspClipId = action.payload.clip_id as string;
              const dspTimeMs = action.payload.time_ms as number;
              if (!dspClipId || dspTimeMs == null) break;
              deleteKfById(dspClipId, "speed", `speed-${dspTimeMs}`);
              break;
            }
            case "CLEAR_SPEED_RAMP": {
              const cspClipId = action.payload.clip_id as string;
              if (!cspClipId) break;
              const cspPath = getMotionPath(cspClipId);
              if (cspPath) {
                cspPath.tracks = cspPath.tracks.filter((t) => t.property !== "speed");
                if (cspPath.tracks.length === 0) deleteMotionPath(cspClipId);
              }
              break;
            }
            // ─── Phase 23: Quick-win actions ──────────────────────────────────
            case "FREEZE_FRAME": {
              const ffClipId = action.payload.clip_id as string;
              const ffTime = action.payload.time_sec as number;
              if (!ffClipId) break;
              const ffClip = store.suggestions.find((c) => c.id === ffClipId);
              if (!ffClip) break;
              store.updateClip(ffClipId, { end: ffClip.start + 5 });
              if (typeof ffTime === "number") store.setPendingSeek(ffTime);
              break;
            }
            case "EXTEND_EDIT": {
              const eeClipId = (action.payload.clip_id as string) || store.selectedClipId;
              if (!eeClipId) break;
              const eeClip = store.suggestions.find((c) => c.id === eeClipId);
              if (!eeClip) break;
              const t = store.currentTime;
              if (t > eeClip.start && t !== eeClip.end) store.updateClip(eeClipId, { end: t });
              break;
            }
            case "GOTO_TIMECODE": {
              const tc = action.payload.timecode as string;
              if (!tc) break;
              const parts = tc.split(":").map(Number);
              let sec = 0;
              if (parts.length === 1) sec = parts[0];
              else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
              else if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
              if (!isNaN(sec) && sec >= 0) store.setPendingSeek(Math.min(sec, store.duration));
              break;
            }
            case "TAG_AUDIO_CATEGORY": {
              const tacClipId = action.payload.clip_id as string;
              const tacCat = action.payload.category as string;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (tacClipId && tacCat) store.updateClip(tacClipId, { audioCategory: tacCat } as any);
              break;
            }
            case "MATCH_FRAME": {
              const mfClip = store.selectedClipId
                ? store.suggestions.find((c) => c.id === store.selectedClipId)
                : store.suggestions[0];
              if (mfClip) {
                const mfOffset = store.currentTime - mfClip.start;
                const mfSrc = (mfClip.inPoint ?? mfClip.start) + mfOffset;
                store.setPendingSeek(Math.max(0, Math.min(store.duration, mfSrc)));
              }
              break;
            }
            case "REVERSE_CLIP": {
              const rvClipId = action.payload.clip_id as string;
              if (!rvClipId) break;
              const rvClip = store.suggestions.find((c) => c.id === rvClipId);
              if (!rvClip) break;
              store.updateClip(rvClipId, {
                inPoint: rvClip.outPoint ?? rvClip.end,
                outPoint: rvClip.inPoint ?? rvClip.start,
              });
              break;
            }
            case "SET_CLIP_COLOR_LABEL": {
              const sccClipId = action.payload.clip_id as string;
              const sccColor = action.payload.color as string;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (sccClipId && sccColor) store.updateClip(sccClipId, { colorLabel: sccColor } as any);
              break;
            }
            // ─── Phase 24: Adjustment layers + audio ducking ──────────────────
            case "APPLY_FILTER_TO_ALL": {
              const aftFilter = action.payload.filter as string;
              const aftValue = action.payload.value;
              if (aftFilter && aftValue !== undefined) {
                store.suggestions.forEach((clip) => {
                  store.updateClip(clip.id, { [aftFilter]: aftValue } as Parameters<typeof store.updateClip>[1]);
                });
              }
              break;
            }
            case "ENABLE_AUDIO_DUCKING": {
              store.setAudioDucking({
                enabled: action.payload.enabled as boolean,
                ...(action.payload.threshold !== undefined && { threshold: action.payload.threshold as number }),
                ...(action.payload.reduction !== undefined && { reduction: action.payload.reduction as number }),
              });
              break;
            }
            // ─── Phase 25: Grouping, auto-split, track matte ─────────────────
            case "GROUP_CLIPS": {
              const gcIds = action.payload.clip_ids as string[];
              if (gcIds?.length > 1) store.addClipGroup(gcIds);
              break;
            }
            case "AUTO_SPLIT_SCENES": {
              // Splits at all current timeline markers (scene detection runs separately)
              const sceneMarkers = store.timelineMarkers.filter((m) => m.label === "Scene");
              sceneMarkers.forEach((m) => store.splitClipAtTime(m.time));
              break;
            }
            case "SET_TRACK_MATTE": {
              const stmClipId = action.payload.clip_id as string;
              const stmMatteId = action.payload.matte_clip_id as string;
              if (stmClipId && stmMatteId) {
                set((s) => ({ trackMattes: { ...s.trackMattes, [stmClipId]: stmMatteId } }));
              }
              break;
            }
            // ─── Phase 34: Crop / Pan / Opacity / BG Remove / Split Screen ───
            case "SET_CROP": {
              store.setFrameFilter({
                cropTop:    (action.payload.top    as number) ?? 0,
                cropBottom: (action.payload.bottom as number) ?? 0,
                cropLeft:   (action.payload.left   as number) ?? 0,
                cropRight:  (action.payload.right  as number) ?? 0,
              });
              break;
            }
            case "SET_PAN": {
              store.setFrameFilter({
                panX: (action.payload.x as number) ?? 0,
                panY: (action.payload.y as number) ?? 0,
              });
              break;
            }
            case "RESET_CROP_PAN":
              store.setFrameFilter({ cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, panX: 0, panY: 0 });
              break;
            case "SET_CLIP_OPACITY": {
              const opVal = Math.max(0, Math.min(1, (action.payload.value as number) ?? 1));
              store.setFrameFilter({ opacity: opVal });
              break;
            }
            case "TOGGLE_BACKGROUND_REMOVE": {
              const bgEnabled = action.payload.enabled !== undefined
                ? (action.payload.enabled as boolean)
                : !(store.frameFilters.backgroundRemoveEnabled ?? false);
              store.setFrameFilter({ backgroundRemoveEnabled: bgEnabled });
              if (bgEnabled) store.setMaskEnabled(true);
              break;
            }
            case "SET_SPLIT_SCREEN":
              store.setSplitScreenPreset((action.payload.preset_id as string) || null);
              break;
          }
        });
      },

      // ─── Pillar-3 AI undo / redo ──────────────────────────────────────────
      pushAiSnapshot: (label) => {
        const s = useEditorStore.getState();
        const snapshot: AiSnapshot = {
          label,
          timestamp: Date.now(),
          elements: typeof structuredClone !== "undefined"
            ? structuredClone(s.elements)
            : JSON.parse(JSON.stringify(s.elements)),
          selectedElementId: s.selectedElementId,
          captions: typeof structuredClone !== "undefined"
            ? structuredClone(s.captions)
            : JSON.parse(JSON.stringify(s.captions)),
          trimMarker: s.trimMarker ? { ...s.trimMarker } : null,
          frameFilters: { ...s.frameFilters },
          exportSettings: { ...s.exportSettings },
          captionsEnabled: s.captionsEnabled,
          currentTime: s.currentTime,
        };
        set((state) => ({
          aiUndoStack: [...state.aiUndoStack.slice(-(_MAX_AI_STACK - 1)), snapshot],
          aiRedoStack: [],
        }));
      },

      undoAiEdit: () => {
        const s = useEditorStore.getState();
        if (s.aiUndoStack.length === 0) return false;
        const snapshot = s.aiUndoStack[s.aiUndoStack.length - 1];
        // Capture current for redo
        const current: AiSnapshot = {
          label: snapshot.label,
          timestamp: Date.now(),
          elements: typeof structuredClone !== "undefined"
            ? structuredClone(s.elements)
            : JSON.parse(JSON.stringify(s.elements)),
          selectedElementId: s.selectedElementId,
          captions: typeof structuredClone !== "undefined"
            ? structuredClone(s.captions)
            : JSON.parse(JSON.stringify(s.captions)),
          trimMarker: s.trimMarker ? { ...s.trimMarker } : null,
          frameFilters: { ...s.frameFilters },
          exportSettings: { ...s.exportSettings },
          captionsEnabled: s.captionsEnabled,
          currentTime: s.currentTime,
        };
        set((state) => ({
          aiUndoStack: state.aiUndoStack.slice(0, -1),
          aiRedoStack: [...state.aiRedoStack.slice(-(_MAX_AI_STACK - 1)), current],
          elements: snapshot.elements,
          selectedElementId: snapshot.selectedElementId,
          captions: snapshot.captions,
          trimMarker: snapshot.trimMarker,
          frameFilters: snapshot.frameFilters,
          exportSettings: snapshot.exportSettings,
          captionsEnabled: snapshot.captionsEnabled,
          currentTime: snapshot.currentTime,
        }));
        return true;
      },

      redoAiEdit: () => {
        const s = useEditorStore.getState();
        if (s.aiRedoStack.length === 0) return false;
        const snapshot = s.aiRedoStack[s.aiRedoStack.length - 1];
        const current: AiSnapshot = {
          label: snapshot.label,
          timestamp: Date.now(),
          elements: typeof structuredClone !== "undefined"
            ? structuredClone(s.elements)
            : JSON.parse(JSON.stringify(s.elements)),
          selectedElementId: s.selectedElementId,
          captions: typeof structuredClone !== "undefined"
            ? structuredClone(s.captions)
            : JSON.parse(JSON.stringify(s.captions)),
          trimMarker: s.trimMarker ? { ...s.trimMarker } : null,
          frameFilters: { ...s.frameFilters },
          exportSettings: { ...s.exportSettings },
          captionsEnabled: s.captionsEnabled,
          currentTime: s.currentTime,
        };
        set((state) => ({
          aiRedoStack: state.aiRedoStack.slice(0, -1),
          aiUndoStack: [...state.aiUndoStack.slice(-(_MAX_AI_STACK - 1)), current],
          elements: snapshot.elements,
          selectedElementId: snapshot.selectedElementId,
          captions: snapshot.captions,
          trimMarker: snapshot.trimMarker,
          frameFilters: snapshot.frameFilters,
          exportSettings: snapshot.exportSettings,
          captionsEnabled: snapshot.captionsEnabled,
          currentTime: snapshot.currentTime,
        }));
        return true;
      },

      applyAiEdits: (wireActions, options) => {
        if (!wireActions.length) return;
        const store = useEditorStore.getState();
        store.pushAiSnapshot(options?.snapshotLabel || "AI edit");

        // Translate wire format (flat Pydantic) → dispatcher payload envelope
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const translated: EditorAction[] = wireActions.map((a: any) => {
          const { type, ...rest } = a;
          // For element actions the element/id/patch live directly on rest
          // For existing 20 actions rest IS the payload
          return { type, payload: rest } as EditorAction;
        });

        store.dispatchAIActions(translated);
        store.rebuildRenderManifest();

        // Seek to the first action that has a meaningful time field
        if (options?.seekToFirstEdit !== false) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const first = wireActions.find((a: any) =>
            typeof a.time === "number" ||
            typeof a.start === "number" ||
            typeof a.startTime === "number",
          ) as Record<string, unknown> | undefined;
          if (first) {
            const t = (first.time ?? first.start ?? first.startTime) as number;
            store.setCurrentTime(t);
          }
        }
      },

      resetForNewVideo: () =>
        set({
          runId: genRunId(),
          suggestions: [],
          captions: [],
          transcript: null,
          silenceSegments: [],
          waveformPeaks: null,
          videoAnalysis: null,
          selectedClipId: null,
          canvasElements: [],
          elements: [],
          selectedElementId: null,
          lastAddedElementId: null,
          trimMarker: null,
          undoStack: [],
          redoStack: [],
          aiUndoStack: [],
          aiRedoStack: [],
          aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },
          markIn: null,
          markOut: null,
          timelineMarkers: [],
          progress: 0,
          isProcessing: false,
          currentStage: "idle",
          tracks: createDefaultTracks(),
          timelineRevision: 0,
          compiledManifest: null,
        }),

      reset: () =>
        set({
          sourceFile: null,
          sourceUrl: null,
          thumbnailUrl: null,
          sourceGcsPath: null,
          runId: genRunId(),
          duration: 0,
          resolution: null,
          isProcessing: false,
          currentStage: "idle",
          progress: 0,
          agentStates: {
            ingestion: { status: "idle", label: "Downloading Video", progress: 0 },
            transcription: { status: "idle", label: "Reading Content", progress: 0 },
            viralAnalysis: { status: "idle", label: "Predicting Success", progress: 0 },
            reframing: { status: "idle", label: "Optimizing Format", progress: 0 },
          },
          currentTime: 0,
          isPlaying: false,
          pendingSeek: null,
          transcript: null,
          suggestions: [],
          silenceSegments: [],
          waveformPeaks: null,
          captionsEnabled: true,
          selectedClipId: null,
          canvasElements: [],
          elements: [],
          selectedElementId: null,
          lastAddedElementId: null,
          exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
          undoStack: [],
          redoStack: [],
          aiUndoStack: [],
          aiRedoStack: [],
          aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },
          markIn: null,
          markOut: null,
          timelineMarkers: [],
          videoMetadata: null,
          captions: [],
          trimMarker: null,
          frameFilters: { ...DEFAULT_FRAME_FILTERS },
          aiMessages: [],
          isAIThinking: false,
          aiPanelOpen: false,
          videoAnalysis: null,
          videoElementRef: null,
          tracks: createDefaultTracks(),
          timelineRevision: 0,
          compiledManifest: null,
        }),

      setAiSuggestions: (patch) =>
        set((state) => ({ aiSuggestions: { ...state.aiSuggestions, ...patch } })),

      clearAiSuggestions: () => set({ aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS } }),

      setMarkIn: (t) => set({ markIn: t }),
      setMarkOut: (t) => set({ markOut: t }),
      clearMarks: () => set({ markIn: null, markOut: null }),
      addTimelineMarker: (time, label = "", color = "purple") =>
        set((state) => ({
          timelineMarkers: [
            ...state.timelineMarkers,
            { id: crypto.randomUUID(), time, label, color },
          ].sort((a, b) => a.time - b.time),
        })),
      removeTimelineMarker: (id) =>
        set((state) => ({
          timelineMarkers: state.timelineMarkers.filter((m) => m.id !== id),
        })),
      clearTimelineMarkers: () => set({ timelineMarkers: [] }),

      setBRollDrawerOpen: (open) => set({ isBRollDrawerOpen: open }),

      setActiveTimelineTool: (tool) => set({ activeTimelineTool: tool }),

      setClipColor: (patch) =>
        set((s) =>
          patch === null
            ? { clipColorState: null }
            : { clipColorState: { ...(s.clipColorState ?? {}), ...patch } }
        ),

      setMaskEnabled: (enabled) => set({ maskEnabled: enabled }),

      // Phase 23
      setAudioMuted: (v) => set({ audioMuted: v }),

      // Phase 24
      setAudioDucking: (patch) =>
        set((s) => ({ audioDucking: { ...s.audioDucking, ...patch } })),

      // Phase 25
      addClipGroup: (ids) =>
        set((s) => ({ clipGroups: [...s.clipGroups, ids] })),
      removeClipGroup: (groupIndex) =>
        set((s) => ({ clipGroups: s.clipGroups.filter((_, i) => i !== groupIndex) })),
      setProjectTemplate: (t) => set({ projectTemplate: t }),

      // Phase 34
      setDefaultTransition: (name) => set({ defaultTransition: name }),
      setSplitScreenPreset: (id) => set({ splitScreenPresetId: id }),

      // Phase 36
      addTrack: (type) =>
        set((s) => {
          const count = s.tracks.filter((t) => t.type === type).length + 1;
          const label = type === "video" ? `V${count}` : `A${count}`;
          const id = `${type[0]}${count}`;
          return {
            tracks: [
              ...s.tracks,
              {
                id,
                type,
                label,
                clips: [],
                locked: false,
                muted: false,
                solo: false,
                height: type === "video" ? 32 : 24,
              },
            ],
          };
        }),
      removeTrack: (trackId) =>
        set((s) => ({ tracks: s.tracks.filter((t) => t.id !== trackId) })),
      setTrackLocked: (trackId, locked) =>
        set((s) => ({
          tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, locked } : t)),
        })),
      setTrackMuted: (trackId, muted) =>
        set((s) => ({
          tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, muted } : t)),
        })),

      rebuildRenderManifest: () => {
        const state = useEditorStore.getState();
        const manifest = compileRenderManifest(state);
        set({
          compiledManifest: manifest,
          timelineRevision: state.timelineRevision + 1,
        });

        const errors = validateRenderManifest(manifest);
        if (errors.length > 0) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[RenderManifest Validation Errors]:", errors);
          }
        }
      },
    }),
    {
      name: "EditorStore",
      enabled: process.env.NODE_ENV !== "production",
    },
  ),
);
