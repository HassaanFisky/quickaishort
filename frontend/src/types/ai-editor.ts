/**
 * TypeScript mirror of fastapi/models/ai_editor.py
 * KEEP IN SYNC — any Pydantic model change must be reflected here.
 *
 * All 23 action variants are discriminated on the `type` field.
 * Response array fields are Readonly to prevent accidental mutation.
 */

// ─── Element data ─────────────────────────────────────────────────────────────

export interface TextElementData {
  type: "TEXT";
  text: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
  fontWeight?: number;
  fontSize?: number;
  className?: string;
}

export interface ZoomElementData {
  type: "ZOOM";
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface TrimElementData {
  type: "TRIM";
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface StickerElementData {
  type: "STICKER";
  emoji: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export type AiEditorElementData =
  | TextElementData
  | ZoomElementData
  | TrimElementData
  | StickerElementData;

// ─── 23 Action variants ───────────────────────────────────────────────────────

export interface AddCaptionAction      { type: "ADD_CAPTION";       text: string; startTime: number; endTime: number; style?: Record<string, unknown> }
export interface RemoveCaptionAction   { type: "REMOVE_CAPTION";    id: string }
export interface UpdateCaptionAction   { type: "UPDATE_CAPTION";    id: string; patch: Record<string, unknown> }
export interface TrimAction            { type: "TRIM";              start: number; end: number }
export interface SplitClipAction       { type: "SPLIT_CLIP";        time: number }
export interface DeleteClipAction      { type: "DELETE_CLIP";       id?: string }
export interface SelectClipAction      { type: "SELECT_CLIP";       id?: string; index?: number }
export interface AddFilterAction       { type: "ADD_FILTER";        filter: "brightness" | "contrast" | "saturation" | "hue" | "blur"; value: number }
export interface ResetFilterAction     { type: "RESET_FILTER" }
export interface SetVisualFilterAction { type: "SET_VISUAL_FILTER"; filter: "None" | "Urban" | "Retro" | "Cinematic" }
export interface SetAudioBoostAction   { type: "SET_AUDIO_BOOST";   value: number }
export interface SetNoiseReductionAction { type: "SET_NOISE_REDUCTION"; value: number }
export interface SetPlaybackSpeedAction  { type: "SET_PLAYBACK_SPEED";  value: number }
export interface ToggleCaptionsAction  { type: "TOGGLE_CAPTIONS";  enabled: boolean }
export interface ToggleTransitionsAction { type: "TOGGLE_TRANSITIONS"; enabled: boolean }
export interface ToggleVoiceoverAction { type: "TOGGLE_VOICEOVER"; enabled: boolean }
export interface SeekAction            { type: "SEEK";              time: number }
export interface PlayAction            { type: "PLAY" }
export interface PauseAction           { type: "PAUSE" }
export interface ExportClipAction      { type: "EXPORT_CLIP" }
export interface AddElementAction      { type: "ADD_ELEMENT";      element: AiEditorElementData }
export interface UpdateElementAction   { type: "UPDATE_ELEMENT";   id: string; patch: Record<string, unknown> }
export interface RemoveElementAction   { type: "REMOVE_ELEMENT";   id: string }

// ─── Intelligent tool actions (4 additional variants) ────────────────────────

export interface ViralMoment {
  timestamp: number;
  hook: string;
  score: number;
}

export interface DetectViralMomentsAction { type: "DETECT_VIRAL_MOMENTS"; moments: ViralMoment[] }
export interface GenerateHookCaptionAction { type: "GENERATE_HOOK_CAPTION"; captions: string[] }
export interface SuggestStylePresetAction  { type: "SUGGEST_STYLE_PRESET";  preset: "Urban" | "Retro" | "Cinematic"; reason: string; actions: AiEditorAction[] }
export interface ExplainLastEditAction     { type: "EXPLAIN_LAST_EDIT";     explanation: string; confidence: "high" | "medium" | "low" }

// ─── Phase 3a: B-Roll / Overlay types ────────────────────────────────────────

export interface BRollClip {
  pexels_id: number;
  title: string;
  duration_sec: number;
  thumbnail_url: string;
  download_url: string;
  width: number;
  height: number;
}

export type OverlayPosition =
  | "full"
  | "pip_tl"
  | "pip_tr"
  | "pip_bl"
  | "pip_br"
  | "split_left"
  | "split_right";

export interface AddBRollAction {
  type: "ADD_BROLL";
  pexels_id: number;
  download_url: string;
  thumbnail_url: string;
  title: string;
  start_sec: number;
  duration_sec: number;
  position: OverlayPosition;
  opacity: number;
}

export interface AddVideoOverlayAction {
  type: "ADD_VIDEO_OVERLAY";
  source_url: string;
  start_sec: number;
  duration_sec: number;
  position: OverlayPosition;
  opacity: number;
  mute_audio: boolean;
}

export interface RemoveOverlayAction {
  type: "REMOVE_OVERLAY";
  element_id: string;
}

// Frontend-only UI actions (not sent to backend, handled by dispatchAIActions locally)
export interface BRollOpenLibraryAction {
  type: "BROLL_OPEN_LIBRARY";
}

export interface BRollClearAllAction {
  type: "BROLL_CLEAR_ALL";
}

export interface RemoveSilencesAction {
  type: "REMOVE_SILENCES";
  min_silence_sec: number;
  padding_sec: number;
}

export type AiEditorAction =
  | AddCaptionAction
  | RemoveCaptionAction
  | UpdateCaptionAction
  | TrimAction
  | SplitClipAction
  | DeleteClipAction
  | SelectClipAction
  | AddFilterAction
  | ResetFilterAction
  | SetVisualFilterAction
  | SetAudioBoostAction
  | SetNoiseReductionAction
  | SetPlaybackSpeedAction
  | ToggleCaptionsAction
  | ToggleTransitionsAction
  | ToggleVoiceoverAction
  | SeekAction
  | PlayAction
  | PauseAction
  | ExportClipAction
  | AddElementAction
  | UpdateElementAction
  | RemoveElementAction
  | DetectViralMomentsAction
  | GenerateHookCaptionAction
  | SuggestStylePresetAction
  | ExplainLastEditAction
  | AddBRollAction
  | AddVideoOverlayAction
  | RemoveOverlayAction
  | BRollOpenLibraryAction
  | BRollClearAllAction
  | RemoveSilencesAction;

export type AiEditorActionType = AiEditorAction["type"];

// ─── Type-narrowing helper ────────────────────────────────────────────────────

export function isAction<T extends AiEditorActionType>(
  a: AiEditorAction,
  t: T,
): a is Extract<AiEditorAction, { type: T }> {
  return a.type === t;
}

// ─── Request / Response ───────────────────────────────────────────────────────

export interface AiEditorCurrentState {
  videoDuration: number;
  currentTime: number;
  selectedClipId: string | null;
  elementCount: number;
  captionCount: number;
  captionsEnabled: boolean;
  aspectRatio: "9:16" | "1:1" | "16:9" | "4:5";
  visualFilter: "None" | "Urban" | "Retro" | "Cinematic";
  audioBoost: number;
  playbackSpeed: number;
}

export interface AiEditorTranscriptChunk {
  text: string;
  start: number;
  end: number;
}

export interface AiEditorRequest {
  prompt: string;
  current_state: AiEditorCurrentState;
  transcript: AiEditorTranscriptChunk[];
  video_id?: string | null;
  run_id?: string | null;
}

export interface AiEditorResponse {
  actions: Readonly<AiEditorAction[]>;
  message: string;
  suggestions: Readonly<string[]>;
  status: "ok" | "clarification_needed" | "no_op" | "mocked";
  used_mock: boolean;
  model: string | null;
  clamped: Readonly<string[]>;
  dropped: Readonly<string[]>;
}
