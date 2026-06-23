"""Pydantic models for the AI Editor endpoint (/api/ai-edit).

30-variant discriminated-union action set + request/response envelopes.
TypeScript mirror lives at: frontend/src/types/ai-editor.ts
"""

from __future__ import annotations
from enum import Enum

from typing import Annotated, Any, Literal, Optional, Union, List

from pydantic import BaseModel, ConfigDict, Field

# ─── B-Roll / Overlay position literal ───────────────────────────────────────

_OVERLAY_POSITION = Literal[
    "full",
    "pip_tl",
    "pip_tr",
    "pip_bl",
    "pip_br",
    "split_left",
    "split_right",
]

# ─── B-Roll search result ─────────────────────────────────────────────────────


class BRollClip(BaseModel):
    """A single B-roll candidate returned by /api/broll/search."""

    model_config = ConfigDict(extra="forbid")
    pexels_id: int
    title: str = Field(default="", max_length=200)
    duration_sec: float = Field(ge=0.5, le=600.0)
    thumbnail_url: str
    download_url: str
    width: int = Field(ge=320)
    height: int = Field(ge=180)


# ─── Element data models (used inside ADD_ELEMENT) ────────────────────────────


class TextElementData(BaseModel):
    type: Literal["TEXT"]
    text: str = ""
    x: float = Field(default=540.0, ge=-10000, le=10000)  # sanitiser clamps to canvas
    y: float = Field(default=960.0, ge=-10000, le=10000)
    scale: float = Field(default=1.0, ge=0.01, le=100)
    rotation: float = Field(default=0.0, ge=-3600, le=3600)
    color: str = "#FFFFFF"
    fontWeight: Optional[int] = None
    fontSize: Optional[float] = None
    className: Optional[str] = None


class ZoomElementData(BaseModel):
    type: Literal["ZOOM"]
    x: float = Field(default=540.0, ge=-10000, le=10000)
    y: float = Field(default=960.0, ge=-10000, le=10000)
    scale: float = Field(default=1.5, ge=0.01, le=100)
    rotation: float = Field(default=0.0, ge=-3600, le=3600)


class TrimElementData(BaseModel):
    type: Literal["TRIM"]
    startTime: float = Field(default=0.0, ge=-86400, le=86400)
    endTime: float = Field(default=0.0, ge=-86400, le=86400)
    x: float = Field(default=0.0, ge=-10000, le=10000)
    y: float = Field(default=0.0, ge=-10000, le=10000)
    scale: float = Field(default=1.0, ge=0.01, le=100)
    rotation: float = Field(default=0.0, ge=-3600, le=3600)


class StickerElementData(BaseModel):
    type: Literal["STICKER"]
    emoji: str = "⭐"
    x: float = Field(default=540.0, ge=-10000, le=10000)
    y: float = Field(default=960.0, ge=-10000, le=10000)
    scale: float = Field(default=1.0, ge=0.01, le=100)
    rotation: float = Field(default=0.0, ge=-3600, le=3600)


EditorElementData = Annotated[
    Union[TextElementData, ZoomElementData, TrimElementData, StickerElementData],
    Field(discriminator="type"),
]

# ─── 23 Action variants ───────────────────────────────────────────────────────


class AddCaptionAction(BaseModel):
    type: Literal["ADD_CAPTION"]
    text: str
    startTime: float = Field(
        default=0.0, ge=-86400, le=86400
    )  # sanitiser clamps to [0, videoDuration]
    endTime: float = Field(default=0.0, ge=-86400, le=86400)
    style: Optional[dict[str, Any]] = None


class RemoveCaptionAction(BaseModel):
    type: Literal["REMOVE_CAPTION"]
    id: str


class UpdateCaptionAction(BaseModel):
    type: Literal["UPDATE_CAPTION"]
    id: str
    patch: dict[str, Any]


class TrimAction(BaseModel):
    type: Literal["TRIM"]
    start: float = Field(
        default=0.0, ge=-86400, le=86400
    )  # sanitiser clamps to [0, videoDuration]
    end: float = Field(default=0.0, ge=-86400, le=86400)


class SplitClipAction(BaseModel):
    type: Literal["SPLIT_CLIP"]
    time: float = Field(default=0.0, ge=-86400, le=86400)  # sanitiser clamps


class DeleteClipAction(BaseModel):
    type: Literal["DELETE_CLIP"]
    id: Optional[str] = None


class SelectClipAction(BaseModel):
    type: Literal["SELECT_CLIP"]
    id: Optional[str] = None
    index: Optional[int] = None


class AddFilterAction(BaseModel):
    type: Literal["ADD_FILTER"]
    filter: Literal["brightness", "contrast", "saturation", "hue", "blur"]
    value: float


class ResetFilterAction(BaseModel):
    type: Literal["RESET_FILTER"]


class SetVisualFilterAction(BaseModel):
    type: Literal["SET_VISUAL_FILTER"]
    filter: Literal["None", "Urban", "Retro", "Cinematic"]


class SetAudioBoostAction(BaseModel):
    type: Literal["SET_AUDIO_BOOST"]
    value: int = Field(ge=0, le=200)


class SetNoiseReductionAction(BaseModel):
    type: Literal["SET_NOISE_REDUCTION"]
    value: int = Field(ge=0, le=100)


class SetPlaybackSpeedAction(BaseModel):
    type: Literal["SET_PLAYBACK_SPEED"]
    value: int = Field(ge=50, le=200)


class ToggleCaptionsAction(BaseModel):
    type: Literal["TOGGLE_CAPTIONS"]
    enabled: bool


class ToggleTransitionsAction(BaseModel):
    type: Literal["TOGGLE_TRANSITIONS"]
    enabled: bool


class ToggleVoiceoverAction(BaseModel):
    type: Literal["TOGGLE_VOICEOVER"]
    enabled: bool


class SeekAction(BaseModel):
    type: Literal["SEEK"]
    time: float = Field(
        default=0.0, ge=-86400, le=86400
    )  # sanitiser clamps to [0, videoDuration]


class PlayAction(BaseModel):
    type: Literal["PLAY"]


class PauseAction(BaseModel):
    type: Literal["PAUSE"]


class ExportClipAction(BaseModel):
    type: Literal["EXPORT_CLIP"]


class AddElementAction(BaseModel):
    type: Literal["ADD_ELEMENT"]
    element: EditorElementData


class UpdateElementAction(BaseModel):
    type: Literal["UPDATE_ELEMENT"]
    id: str
    patch: dict[str, Any]


class RemoveElementAction(BaseModel):
    type: Literal["REMOVE_ELEMENT"]
    id: str


# ─── Intelligent tool actions (4 additional variants) ─────────────────────────


class ViralMoment(BaseModel):
    timestamp: float = Field(ge=0)
    hook: str
    score: float = Field(ge=0, le=100)


class DetectViralMomentsAction(BaseModel):
    type: Literal["DETECT_VIRAL_MOMENTS"]
    moments: list[ViralMoment]


class GenerateHookCaptionAction(BaseModel):
    type: Literal["GENERATE_HOOK_CAPTION"]
    captions: list[str]


class SuggestStylePresetAction(BaseModel):
    type: Literal["SUGGEST_STYLE_PRESET"]
    preset: Literal["Urban", "Retro", "Cinematic"]
    reason: str
    actions: list["AiEditorAction"] = Field(default_factory=list)


class ExplainLastEditAction(BaseModel):
    type: Literal["EXPLAIN_LAST_EDIT"]
    explanation: str
    confidence: Literal["high", "medium", "low"] = "medium"


# ─── Phase 3a: B-Roll / Overlay actions ──────────────────────────────────────


class AddBRollAction(BaseModel):
    """AI or user dispatches a B-roll clip onto the V3 lane at a timestamp."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_BROLL"]
    pexels_id: int
    download_url: str
    thumbnail_url: str
    title: str = Field(default="", max_length=200)
    start_sec: float = Field(ge=0, le=86400)
    duration_sec: float = Field(ge=0.5, le=60.0)
    position: _OVERLAY_POSITION = "pip_br"
    opacity: float = Field(default=1.0, ge=0.1, le=1.0)


class AddVideoOverlayAction(BaseModel):
    """User-uploaded video overlay (PIP, split-screen) on the V2 lane."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_VIDEO_OVERLAY"]
    source_url: str
    start_sec: float = Field(ge=0, le=86400)
    duration_sec: float = Field(ge=0.5, le=300.0)
    position: _OVERLAY_POSITION = "pip_tr"
    opacity: float = Field(default=1.0, ge=0.1, le=1.0)
    mute_audio: bool = True


class RemoveOverlayAction(BaseModel):
    """Remove a single overlay or B-roll element by id."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["REMOVE_OVERLAY"]
    element_id: str = Field(min_length=1, max_length=128)


class RemoveSilencesAction(BaseModel):
    """Trim silent gaps from the video using transcript timing data."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["REMOVE_SILENCES"]
    min_silence_sec: float = Field(default=0.6, ge=0.2, le=5.0)
    padding_sec: float = Field(default=0.08, ge=0.0, le=1.0)


# ─── Phase 4b: NLE Timeline Tool actions ──────────────────────────────────────


class PointerSelectAction(BaseModel):
    """Activate the pointer/select tool and optionally select a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["POINTER_SELECT"]
    clip_id: Optional[str] = None


class BladeSplitAction(BaseModel):
    """Split all clips at the given timeline position (razor/blade tool)."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["BLADE_SPLIT"]
    time_sec: float = Field(ge=0.0)


class RippleTrimAction(BaseModel):
    """Ripple-trim a clip's in or out point, shifting all downstream clips."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["RIPPLE_TRIM"]
    clip_id: str = Field(min_length=1, max_length=128)
    edge: Literal["in", "out"]
    delta_sec: float = Field(ge=-3600.0, le=3600.0)


class RollingTrimAction(BaseModel):
    """Rolling trim: adjust edit point between two adjacent clips simultaneously."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ROLLING_TRIM"]
    clip_id: str = Field(min_length=1, max_length=128)
    neighbor_id: str = Field(min_length=1, max_length=128)
    edge: Literal["in", "out"]
    delta_sec: float = Field(ge=-3600.0, le=3600.0)


class SlipAction(BaseModel):
    """Slip a clip: shift source in/out without changing its timeline position."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SLIP_CLIP"]
    clip_id: str = Field(min_length=1, max_length=128)
    delta_sec: float = Field(ge=-3600.0, le=3600.0)


class SlideAction(BaseModel):
    """Slide a clip: move it in the timeline, trimming its neighbors to fill."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SLIDE_CLIP"]
    clip_id: str = Field(min_length=1, max_length=128)
    delta_sec: float = Field(ge=-3600.0, le=3600.0)


class RippleDeleteAction(BaseModel):
    """Delete a clip and ripple-close the resulting gap."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["RIPPLE_DELETE"]
    clip_id: str = Field(min_length=1, max_length=128)


class DurationStretchAction(BaseModel):
    """Time-stretch a clip to a target duration or speed factor."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["DURATION_STRETCH"]
    clip_id: str = Field(min_length=1, max_length=128)
    target_duration_sec: Optional[float] = Field(default=None, ge=0.1, le=3600.0)
    speed_factor: Optional[float] = Field(default=None, ge=0.1, le=10.0)


# ─── Phase 4b-wave-2: 14 additional NLE timeline tools ────────────────────────


class ForwardLaneSelectorAction(BaseModel):
    """Select the clip on the track immediately forward of the current selection."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["FORWARD_LANE_SELECT"]
    clip_id: Optional[str] = Field(default=None, max_length=128)


class BackwardLaneSelectorAction(BaseModel):
    """Select the clip on the track immediately backward of the current selection."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["BACKWARD_LANE_SELECT"]
    clip_id: Optional[str] = Field(default=None, max_length=128)


class MarkInAction(BaseModel):
    """Set the In point of the timeline range selection."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["MARK_IN"]
    time_sec: float = Field(ge=0.0, le=86400.0)


class MarkOutAction(BaseModel):
    """Set the Out point of the timeline range selection."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["MARK_OUT"]
    time_sec: float = Field(ge=0.0, le=86400.0)


class ClipRangeMarkAction(BaseModel):
    """Set In/Out points to match a specific clip's boundaries."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["CLIP_RANGE_MARK"]
    clip_id: str = Field(min_length=1, max_length=128)


class RangeMarkAction(BaseModel):
    """Set an arbitrary In/Out range on the timeline."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["RANGE_MARK"]
    in_sec: float = Field(ge=0.0, le=86400.0)
    out_sec: float = Field(ge=0.0, le=86400.0)


class ExtractAction(BaseModel):
    """Remove a clip from the timeline and close the gap (ripple delete)."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["EXTRACT"]
    clip_id: str = Field(min_length=1, max_length=128)


class LiftAction(BaseModel):
    """Remove a clip from the timeline and leave a gap (non-ripple delete)."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["LIFT"]
    clip_id: str = Field(min_length=1, max_length=128)


class InsertEditAction(BaseModel):
    """Insert a clip at a specific timeline position, pushing later clips downstream."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["INSERT_EDIT"]
    clip_id: str = Field(min_length=1, max_length=128)
    insert_time_sec: float = Field(ge=0.0, le=86400.0)


class OverwriteEditAction(BaseModel):
    """Overwrite the timeline at a specific position with a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["OVERWRITE_EDIT"]
    clip_id: str = Field(min_length=1, max_length=128)
    insert_time_sec: float = Field(ge=0.0, le=86400.0)


class SwapClipAction(BaseModel):
    """Swap the positions of two clips on the timeline."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SWAP_CLIP"]
    clip_id: str = Field(min_length=1, max_length=128)
    target_clip_id: str = Field(min_length=1, max_length=128)


class ScrollHandAction(BaseModel):
    """Pan the timeline view by a pixel delta (hand/scroll tool)."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SCROLL_HAND"]
    delta_x: float = Field(default=0.0, ge=-10000.0, le=10000.0)
    delta_y: float = Field(default=0.0, ge=-10000.0, le=10000.0)


class TimelineZoomAction(BaseModel):
    """Zoom the timeline view in or out."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["TIMELINE_ZOOM"]
    zoom_factor: float = Field(default=1.0, ge=0.1, le=10.0)


class MagneticSnapToggleAction(BaseModel):
    """Toggle magnetic snapping on the timeline."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["MAGNETIC_SNAP_TOGGLE"]
    enabled: Optional[bool] = None


# ─── Color Suite actions ──────────────────────────────────────────────────────


class ColorWheelValues(BaseModel):
    r: float = Field(default=0.0, ge=-1.0, le=1.0)
    g: float = Field(default=0.0, ge=-1.0, le=1.0)
    b: float = Field(default=0.0, ge=-1.0, le=1.0)
    master: float = Field(default=0.0, ge=-1.0, le=1.0)


class ColorWheelsAction(BaseModel):
    """Adjust CDL Lift/Gamma/Gain/Offset color wheels for a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["COLOR_WHEELS"]
    clip_id: str = Field(min_length=1, max_length=128)
    lift: Optional[ColorWheelValues] = None
    gamma: Optional[ColorWheelValues] = None
    gain: Optional[ColorWheelValues] = None
    offset: Optional[ColorWheelValues] = None


class CurvePoint(BaseModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)


class ColorCurvesAction(BaseModel):
    """Set tone curve control points for master/R/G/B channels."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["COLOR_CURVES"]
    clip_id: str = Field(min_length=1, max_length=128)
    master: Optional[list[CurvePoint]] = None
    red: Optional[list[CurvePoint]] = None
    green: Optional[list[CurvePoint]] = None
    blue: Optional[list[CurvePoint]] = None


class HslSecondariesAction(BaseModel):
    """Adjust HSL secondaries (hue/sat/lum shift with hue qualifier)."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["HSL_SECONDARIES"]
    clip_id: str = Field(min_length=1, max_length=128)
    hue_shift: float = Field(default=0.0, ge=-180.0, le=180.0)
    saturation_adjust: float = Field(default=0.0, ge=-100.0, le=100.0)
    luminance_adjust: float = Field(default=0.0, ge=-100.0, le=100.0)
    qualifier_hue: float = Field(default=0.0, ge=0.0, le=360.0)
    qualifier_range: float = Field(default=30.0, ge=1.0, le=180.0)


class ApplyLutAction(BaseModel):
    """Apply a 3D LUT (.cube) to a clip from a URL."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["APPLY_LUT"]
    clip_id: str = Field(min_length=1, max_length=128)
    lut_url: str = Field(min_length=1, max_length=2048)
    lut_size: int = Field(default=33, ge=17, le=65)
    intensity: float = Field(default=1.0, ge=0.0, le=1.0)


class ResetColorAction(BaseModel):
    """Reset all color corrections for a clip to defaults."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["RESET_COLOR"]
    clip_id: str = Field(min_length=1, max_length=128)


# ─── Web Audio / Mix actions ──────────────────────────────────────────────────


class SetClipGainAction(BaseModel):
    """Set clip output gain in dB."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SET_CLIP_GAIN"]
    clip_id: str = Field(min_length=1, max_length=128)
    gain_db: float = Field(default=0.0, ge=-60.0, le=20.0)


class SetMasterGainAction(BaseModel):
    """Set master output gain in dB."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SET_MASTER_GAIN"]
    gain_db: float = Field(default=0.0, ge=-60.0, le=20.0)


class EnableDenoiseAction(BaseModel):
    """Enable or disable RNNoise denoising on a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ENABLE_DENOISE"]
    clip_id: str = Field(min_length=1, max_length=128)
    enabled: bool = True


class EnableLimiterAction(BaseModel):
    """Enable the brick-wall look-ahead limiter on the master bus."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ENABLE_LIMITER"]
    enabled: bool = True


class AddFadeInAction(BaseModel):
    """Add a fade-in envelope to a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_FADE_IN"]
    clip_id: str = Field(min_length=1, max_length=128)
    duration_ms: float = Field(default=500.0, ge=10.0, le=10000.0)


class AddFadeOutAction(BaseModel):
    """Add a fade-out envelope to a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_FADE_OUT"]
    clip_id: str = Field(min_length=1, max_length=128)
    start_ms: float = Field(default=0.0, ge=0.0, le=86400000.0)
    duration_ms: float = Field(default=500.0, ge=10.0, le=10000.0)


# ─── Masking Suite actions ────────────────────────────────────────────────────


class AddRectMaskAction(BaseModel):
    """Add a rectangular mask to a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_RECT_MASK"]
    clip_id: str = Field(min_length=1, max_length=128)
    x: float = Field(default=0.0, ge=0.0, le=1.0)
    y: float = Field(default=0.0, ge=0.0, le=1.0)
    width: float = Field(default=1.0, ge=0.0, le=1.0)
    height: float = Field(default=1.0, ge=0.0, le=1.0)
    feather: float = Field(default=0.0, ge=0.0, le=1.0)
    invert: bool = False


class AddEllipseMaskAction(BaseModel):
    """Add an elliptical mask to a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_ELLIPSE_MASK"]
    clip_id: str = Field(min_length=1, max_length=128)
    cx: float = Field(default=0.5, ge=0.0, le=1.0)
    cy: float = Field(default=0.5, ge=0.0, le=1.0)
    rx: float = Field(default=0.4, ge=0.001, le=1.0)
    ry: float = Field(default=0.4, ge=0.001, le=1.0)
    rotation: float = Field(default=0.0, ge=-180.0, le=180.0)
    feather: float = Field(default=0.0, ge=0.0, le=1.0)
    invert: bool = False


class MaskPoint(BaseModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)


class AddBezierMaskAction(BaseModel):
    """Add a bezier-path mask to a clip (minimum 3 points)."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_BEZIER_MASK"]
    clip_id: str = Field(min_length=1, max_length=128)
    points: list[MaskPoint] = Field(min_length=3)
    feather: float = Field(default=0.0, ge=0.0, le=1.0)
    invert: bool = False


class AddAiPersonMaskAction(BaseModel):
    """Add a MediaPipe AI person segmentation mask to a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_AI_PERSON_MASK"]
    clip_id: str = Field(min_length=1, max_length=128)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    invert: bool = False


class ClearMasksAction(BaseModel):
    """Remove all masks from a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["CLEAR_MASKS"]
    clip_id: str = Field(min_length=1, max_length=128)


# ─── Motion Keyframe actions ──────────────────────────────────────────────────


class SetKeyframeAction(BaseModel):
    """Add or update a motion keyframe on a clip property."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SET_KEYFRAME"]
    clip_id: str = Field(min_length=1, max_length=128)
    property: str = Field(min_length=1, max_length=32)
    time_ms: float = Field(ge=0.0, le=86400000.0)
    value: float = Field(ge=-100000.0, le=100000.0)
    easing: str = Field(
        default="linear", pattern=r"^(linear|ease-in|ease-out|ease-in-out|bezier)$"
    )


class DeleteKeyframeAction(BaseModel):
    """Delete a specific keyframe from a clip property track."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["DELETE_KEYFRAME"]
    clip_id: str = Field(min_length=1, max_length=128)
    property: str = Field(min_length=1, max_length=32)
    keyframe_id: str = Field(min_length=1, max_length=64)


class ClearKeyframesAction(BaseModel):
    """Remove all keyframes from a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["CLEAR_KEYFRAMES"]
    clip_id: str = Field(min_length=1, max_length=128)


# ─── Phase 8: Project file (QEP) ─────────────────────────────────────────────


class SaveProjectAction(BaseModel):
    """Trigger an autosave / export of the current project to a QEP file."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SAVE_PROJECT"]
    title: Optional[str] = Field(default=None, max_length=128)


class LoadProjectAction(BaseModel):
    """Load a previously saved QEP project by ID from IndexedDB."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["LOAD_PROJECT"]
    project_id: str = Field(min_length=1, max_length=128)


# ─── Phase 9: Auto-reframe ────────────────────────────────────────────────────

_REFRAME_AR = Literal["9:16", "1:1", "4:5"]


class AutoReframeAction(BaseModel):
    """Trigger automatic 16:9→9:16 (or other AR) reframe using face tracking."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["AUTO_REFRAME"]
    clip_id: str = Field(min_length=1, max_length=128)
    target_ar: _REFRAME_AR = "9:16"
    sample_rate_ms: int = Field(default=500, ge=100, le=5000)


# ─── Phase 10: Voiceover, SFX, Transitions ───────────────────────────────────

_TRANSITION_TYPE = Literal[
    "fade",
    "dissolve",
    "wipe_left",
    "wipe_right",
    "zoom_in",
    "zoom_out",
    "glitch",
]


class AddVoiceoverAction(BaseModel):
    """Attach a recorded voiceover segment to a clip."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_VOICEOVER"]
    clip_id: str = Field(min_length=1, max_length=128)
    start_sec: float = Field(default=0.0, ge=0)
    duration_sec: float = Field(ge=0.1, le=300.0)


class AddSfxAction(BaseModel):
    """Place a sound effect at a point in the timeline."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["ADD_SFX"]
    sfx_id: str = Field(min_length=1, max_length=64)
    start_sec: float = Field(default=0.0, ge=0)
    volume: float = Field(default=1.0, ge=0.0, le=2.0)


class SetTransitionAction(BaseModel):
    """Apply a cinematic WGSL transition between two clips."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["SET_TRANSITION"]
    clip_id: str = Field(min_length=1, max_length=128)
    transition: _TRANSITION_TYPE = "fade"


AiEditorAction = Annotated[
    Union[
        AddCaptionAction,
        RemoveCaptionAction,
        UpdateCaptionAction,
        TrimAction,
        SplitClipAction,
        DeleteClipAction,
        SelectClipAction,
        AddFilterAction,
        ResetFilterAction,
        SetVisualFilterAction,
        SetAudioBoostAction,
        SetNoiseReductionAction,
        SetPlaybackSpeedAction,
        ToggleCaptionsAction,
        ToggleTransitionsAction,
        ToggleVoiceoverAction,
        SeekAction,
        PlayAction,
        PauseAction,
        ExportClipAction,
        AddElementAction,
        UpdateElementAction,
        RemoveElementAction,
        DetectViralMomentsAction,
        GenerateHookCaptionAction,
        SuggestStylePresetAction,
        ExplainLastEditAction,
        AddBRollAction,
        AddVideoOverlayAction,
        RemoveOverlayAction,
        RemoveSilencesAction,
        PointerSelectAction,
        BladeSplitAction,
        RippleTrimAction,
        RollingTrimAction,
        SlipAction,
        SlideAction,
        RippleDeleteAction,
        DurationStretchAction,
        ForwardLaneSelectorAction,
        BackwardLaneSelectorAction,
        MarkInAction,
        MarkOutAction,
        ClipRangeMarkAction,
        RangeMarkAction,
        ExtractAction,
        LiftAction,
        InsertEditAction,
        OverwriteEditAction,
        SwapClipAction,
        ScrollHandAction,
        TimelineZoomAction,
        MagneticSnapToggleAction,
        ColorWheelsAction,
        ColorCurvesAction,
        HslSecondariesAction,
        ApplyLutAction,
        ResetColorAction,
        SetClipGainAction,
        SetMasterGainAction,
        EnableDenoiseAction,
        EnableLimiterAction,
        AddFadeInAction,
        AddFadeOutAction,
        AddRectMaskAction,
        AddEllipseMaskAction,
        AddBezierMaskAction,
        AddAiPersonMaskAction,
        ClearMasksAction,
        SetKeyframeAction,
        DeleteKeyframeAction,
        ClearKeyframesAction,
        SaveProjectAction,
        LoadProjectAction,
        AutoReframeAction,
        AddVoiceoverAction,
        AddSfxAction,
        SetTransitionAction,
    ],
    Field(discriminator="type"),
]

# Resolve forward references in SuggestStylePresetAction.actions
SuggestStylePresetAction.model_rebuild()

# ─── Request / Response envelopes ─────────────────────────────────────────────


class AIEditorCurrentState(BaseModel):
    videoDuration: float = Field(ge=0)
    currentTime: float = Field(ge=0)
    selectedClipId: Optional[str] = None
    elementCount: int = Field(ge=0)
    captionCount: int = Field(ge=0)
    captionsEnabled: bool
    aspectRatio: Literal["9:16", "1:1", "16:9", "4:5"]
    visualFilter: Literal["None", "Urban", "Retro", "Cinematic"]
    audioBoost: int = Field(ge=0, le=200)
    playbackSpeed: int = Field(ge=50, le=200)


class TranscriptChunk(BaseModel):
    text: str
    start: float
    end: float


class AIEditorRequest(BaseModel, extra="forbid"):
    prompt: str = Field(min_length=1, max_length=2000)
    current_state: AIEditorCurrentState
    transcript: list[TranscriptChunk] = Field(default_factory=list)
    video_id: Optional[str] = None
    run_id: Optional[str] = None


class AIEditorResponse(BaseModel):
    actions: list[AiEditorAction]
    message: str
    suggestions: list[str]
    status: Literal["ok", "clarification_needed", "no_op", "mocked"]
    used_mock: bool
    model: Optional[str]
    clamped: list[str]
    dropped: list[str]


class ToolName(str, Enum):
    SELECTION = "selection_tool"
    SELECT_FORWARD = "select_forward"
    SELECT_BACKWARD = "select_backward"
    RIPPLE_DELETE = "ripple_delete"
    ROLLING_EDIT = "rolling_edit"
    RATE_STRETCH = "rate_stretch"
    RAZOR = "razor_tool"
    SLIP = "slip_tool"
    SLIDE = "slide_tool"
    PEN_KEYFRAME = "pen_keyframe"
    RECT_MASK = "rect_mask"
    ELLIPSE_MASK = "ellipse_mask"
    HAND = "hand_tool"
    ZOOM = "zoom_tool"
    TEXT_H = "text_horizontal"
    TEXT_V = "text_vertical"
    AI_EXTENDER = "ai_extender"


class ToolParams(BaseModel):
    clip_id: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    value: Optional[Any] = None
    track_index: Optional[int] = None
    text_content: Optional[str] = None
    speed_factor: Optional[float] = None


class EditorAction(BaseModel):
    tool: ToolName
    params: ToolParams
    order: int = Field(ge=1)


class EditorCommandRequest(BaseModel):
    command: str = Field(min_length=1, max_length=2000)
    user_tier: Optional[str] = "free"
    project_context: Optional[dict] = None
    stream: Optional[bool] = False


class EditorCommandResponse(BaseModel):
    intent: str
    confidence: float = Field(ge=0.0, le=1.0)
    actions: List[EditorAction]
    feedback: str
    fallback: str
    model_used: str
