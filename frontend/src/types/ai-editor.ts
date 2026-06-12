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

// ─── Phase 4b: NLE Timeline Tool action interfaces ────────────────────────────

export interface PointerSelectAction  { type: "POINTER_SELECT";  clip_id?: string }
export interface BladeSplitAction     { type: "BLADE_SPLIT";     time_sec: number }
export interface RippleTrimAction     { type: "RIPPLE_TRIM";     clip_id: string; edge: "in" | "out"; delta_sec: number }
export interface RollingTrimAction    { type: "ROLLING_TRIM";    clip_id: string; neighbor_id: string; edge: "in" | "out"; delta_sec: number }
export interface SlipAction           { type: "SLIP_CLIP";       clip_id: string; delta_sec: number }
export interface SlideAction          { type: "SLIDE_CLIP";      clip_id: string; delta_sec: number }
export interface RippleDeleteAction   { type: "RIPPLE_DELETE";   clip_id: string }
export interface DurationStretchAction { type: "DURATION_STRETCH"; clip_id: string; target_duration_sec?: number; speed_factor?: number }

// ─── Phase 4b-wave-2: 14 additional NLE tools ─────────────────────────────────
export interface ForwardLaneSelectorAction  { type: "FORWARD_LANE_SELECT";  clip_id?: string }
export interface BackwardLaneSelectorAction { type: "BACKWARD_LANE_SELECT"; clip_id?: string }
export interface MarkInAction               { type: "MARK_IN";              time_sec: number }
export interface MarkOutAction              { type: "MARK_OUT";             time_sec: number }
export interface ClipRangeMarkAction        { type: "CLIP_RANGE_MARK";      clip_id: string }
export interface RangeMarkAction            { type: "RANGE_MARK";           in_sec: number; out_sec: number }
export interface ExtractAction              { type: "EXTRACT";              clip_id: string }
export interface LiftAction                 { type: "LIFT";                 clip_id: string }
export interface InsertEditAction           { type: "INSERT_EDIT";          clip_id: string; insert_time_sec: number }
export interface OverwriteEditAction        { type: "OVERWRITE_EDIT";       clip_id: string; insert_time_sec: number }
export interface SwapClipAction             { type: "SWAP_CLIP";            clip_id: string; target_clip_id: string }
export interface ScrollHandAction           { type: "SCROLL_HAND";          delta_x?: number; delta_y?: number }
export interface TimelineZoomAction         { type: "TIMELINE_ZOOM";        zoom_factor: number }
export interface MagneticSnapToggleAction   { type: "MAGNETIC_SNAP_TOGGLE"; enabled?: boolean }

export interface ColorWheelValues           { r?: number; g?: number; b?: number; master?: number }
export interface CurvePoint                 { x: number; y: number }
export interface ColorWheelsAction          { type: "COLOR_WHEELS";      clip_id: string; lift?: ColorWheelValues; gamma?: ColorWheelValues; gain?: ColorWheelValues; offset?: ColorWheelValues }
export interface ColorCurvesAction          { type: "COLOR_CURVES";      clip_id: string; master?: CurvePoint[]; red?: CurvePoint[]; green?: CurvePoint[]; blue?: CurvePoint[] }
export interface HslSecondariesAction       { type: "HSL_SECONDARIES";   clip_id: string; hue_shift?: number; saturation_adjust?: number; luminance_adjust?: number; qualifier_hue?: number; qualifier_range?: number }
export interface ApplyLutAction             { type: "APPLY_LUT";         clip_id: string; lut_url: string; lut_size?: number; intensity?: number }
export interface ResetColorAction           { type: "RESET_COLOR";       clip_id: string }

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
  | RemoveSilencesAction
  | PointerSelectAction
  | BladeSplitAction
  | RippleTrimAction
  | RollingTrimAction
  | SlipAction
  | SlideAction
  | RippleDeleteAction
  | DurationStretchAction
  | ForwardLaneSelectorAction
  | BackwardLaneSelectorAction
  | MarkInAction
  | MarkOutAction
  | ClipRangeMarkAction
  | RangeMarkAction
  | ExtractAction
  | LiftAction
  | InsertEditAction
  | OverwriteEditAction
  | SwapClipAction
  | ScrollHandAction
  | TimelineZoomAction
  | MagneticSnapToggleAction
  | ColorWheelsAction
  | ColorCurvesAction
  | HslSecondariesAction
  | ApplyLutAction
  | ResetColorAction
  | SetClipGainAction
  | SetMasterGainAction
  | EnableDenoiseAction
  | EnableLimiterAction
  | AddFadeInAction
  | AddFadeOutAction
  | AddRectMaskAction
  | AddEllipseMaskAction
  | AddBezierMaskAction
  | AddAiPersonMaskAction
  | ClearMasksAction
  | SetKeyframeAction
  | DeleteKeyframeAction
  | ClearKeyframesAction
  | SaveProjectAction
  | LoadProjectAction
  | AutoReframeAction;

export interface SetKeyframeAction    { type: "SET_KEYFRAME";     clip_id: string; property: string; time_ms: number; value: number; easing?: string }
export interface DeleteKeyframeAction { type: "DELETE_KEYFRAME";  clip_id: string; property: string; keyframe_id: string }
export interface ClearKeyframesAction { type: "CLEAR_KEYFRAMES";  clip_id: string }

export interface SaveProjectAction    { type: "SAVE_PROJECT";     title?: string }
export interface LoadProjectAction    { type: "LOAD_PROJECT";     project_id: string }

export interface AutoReframeAction    { type: "AUTO_REFRAME";     clip_id: string; target_ar?: "9:16" | "1:1" | "4:5"; sample_rate_ms?: number }

export interface SetClipGainAction    { type: "SET_CLIP_GAIN";   clip_id: string; gain_db: number }
export interface SetMasterGainAction  { type: "SET_MASTER_GAIN"; gain_db: number }
export interface EnableDenoiseAction  { type: "ENABLE_DENOISE";  clip_id: string; enabled?: boolean }
export interface EnableLimiterAction  { type: "ENABLE_LIMITER";  enabled?: boolean }
export interface AddFadeInAction      { type: "ADD_FADE_IN";     clip_id: string; duration_ms?: number }
export interface AddFadeOutAction     { type: "ADD_FADE_OUT";    clip_id: string; start_ms?: number; duration_ms?: number }

export interface MaskPoint            { x: number; y: number }
export interface AddRectMaskAction    { type: "ADD_RECT_MASK";      clip_id: string; x?: number; y?: number; width?: number; height?: number; feather?: number; invert?: boolean }
export interface AddEllipseMaskAction { type: "ADD_ELLIPSE_MASK";   clip_id: string; cx?: number; cy?: number; rx?: number; ry?: number; rotation?: number; feather?: number; invert?: boolean }
export interface AddBezierMaskAction  { type: "ADD_BEZIER_MASK";    clip_id: string; points: MaskPoint[]; feather?: number; invert?: boolean }
export interface AddAiPersonMaskAction{ type: "ADD_AI_PERSON_MASK"; clip_id: string; confidence?: number; invert?: boolean }
export interface ClearMasksAction     { type: "CLEAR_MASKS";        clip_id: string }

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
