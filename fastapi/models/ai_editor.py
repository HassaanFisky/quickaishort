"""Pydantic models for the AI Editor endpoint (/api/ai-edit).

23-variant discriminated-union action set + request/response envelopes.
TypeScript mirror lives at: frontend/src/types/ai-editor.ts
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, Field

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
    startTime: float = Field(default=0.0, ge=-86400, le=86400)  # sanitiser clamps to [0, videoDuration]
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
    start: float = Field(default=0.0, ge=-86400, le=86400)  # sanitiser clamps to [0, videoDuration]
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
    time: float = Field(default=0.0, ge=-86400, le=86400)  # sanitiser clamps to [0, videoDuration]


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
    ],
    Field(discriminator="type"),
]

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
