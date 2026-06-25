"""Pydantic models for RenderManifest.

Type and validation parity with frontend/src/lib/render/renderManifest.ts
"""

from typing import Any, Literal, Optional, List, Dict
from pydantic import BaseModel, Field


class RenderTimeline(BaseModel):
    fps: float = Field(..., description="Timeline frames per second")
    width: int = Field(..., description="Canvas width")
    height: int = Field(..., description="Canvas height")
    duration: float = Field(..., description="Total timeline duration in seconds")


class RenderTrack(BaseModel):
    id: str = Field(..., description="Unique track identifier")
    type: Literal["video", "audio"] = Field(..., description="Track media type")
    label: str = Field(..., description="Human readable track label")
    locked: bool = Field(default=False, description="Whether track edits are locked")
    muted: bool = Field(
        default=False, description="Whether track audio output is muted"
    )


class RenderClip(BaseModel):
    id: str = Field(..., description="Unique clip identifier")
    trackId: str = Field(..., description="ID of the track this clip belongs to")
    sourceId: str = Field(..., description="Source asset filename or identifier")
    startSec: float = Field(
        ..., description="Start offset in the source asset in seconds"
    )
    endSec: float = Field(..., description="End offset in the source asset in seconds")
    timelineStartSec: float = Field(
        ..., description="Placement offset on the timeline in seconds"
    )
    speed: float = Field(default=1.0, description="Playback speed factor")
    label: Optional[str] = Field(
        default=None, description="Optional clip name override"
    )
    colorLabel: Optional[str] = Field(
        default=None, description="Optional color code label"
    )


class RenderCaption(BaseModel):
    id: str = Field(..., description="Unique caption identifier")
    text: str = Field(..., description="Caption text payload")
    startTime: float = Field(
        ..., description="Start time offset on the timeline in seconds"
    )
    endTime: float = Field(
        ..., description="End time offset on the timeline in seconds"
    )
    style: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional custom styles"
    )


class RenderOverlay(BaseModel):
    id: str = Field(..., description="Unique overlay identifier")
    type: str = Field(
        ..., description="Overlay type descriptor (e.g. TEXT, STICKER, etc.)"
    )
    startSec: Optional[float] = Field(
        default=None, description="Timeline start time in seconds"
    )
    durationSec: Optional[float] = Field(
        default=None, description="Visibility duration in seconds"
    )
    opacity: Optional[float] = Field(default=None, description="Opacity level")
    x: Optional[float] = Field(default=None, description="X coordinate index")
    y: Optional[float] = Field(default=None, description="Y coordinate index")
    scale: Optional[float] = Field(default=None, description="Scale multiplier")
    rotation: Optional[float] = Field(
        default=None, description="Rotation angle in degrees"
    )
    payload: Dict[str, Any] = Field(
        default_factory=dict, description="Raw element attributes payload"
    )


class RenderEffect(BaseModel):
    id: str = Field(..., description="Unique effect identifier")
    clipId: Optional[str] = Field(
        default=None, description="Associated clip ID if nested"
    )
    type: str = Field(..., description="Effect type descriptor")
    payload: Dict[str, Any] = Field(
        default_factory=dict, description="Raw parameter values"
    )


class RenderKeyframe(BaseModel):
    id: str = Field(..., description="Unique keyframe identifier")
    targetId: str = Field(..., description="ID of the target overlay or clip property")
    property: str = Field(..., description="Target property name")
    timeSec: float = Field(
        ..., description="Keyframe offset on the timeline in seconds"
    )
    value: Any = Field(..., description="Property value at keyframe time")
    easing: Optional[str] = Field(default=None, description="Easing interpolation name")


class RenderManifest(BaseModel):
    version: Literal[1] = Field(default=1, description="Schema definition version")
    generatedAt: int = Field(..., description="Unix timestamp in ms when compiled")
    timeline: RenderTimeline = Field(
        ..., description="Master timeline metadata settings"
    )
    tracks: List[RenderTrack] = Field(
        default_factory=list, description="Defined editor lanes"
    )
    clips: List[RenderClip] = Field(
        default_factory=list, description="Timeline media segments"
    )
    captions: List[RenderCaption] = Field(
        default_factory=list, description="Subtitles layer definitions"
    )
    overlays: List[RenderOverlay] = Field(
        default_factory=list, description="Custom layout overlay layers"
    )
    effects: List[RenderEffect] = Field(
        default_factory=list, description="Visual/audio filter adjustments"
    )
    keyframes: List[RenderKeyframe] = Field(
        default_factory=list, description="Animated value paths"
    )
    sourceHash: Optional[str] = Field(
        default=None, description="Verification integrity hash of input tracks"
    )
