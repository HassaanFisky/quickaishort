"""Single source of truth for all AI-emitted QEP patch types.

Every agent (Director, Script, Preflight) MUST emit actions from this catalogue.
Anything not in QepPatch is rejected by validate_patches() with HTTP 422.

Human-readable label mapping (never expose raw field names to users):
  vocal_contrast_lift_db     → "Vocal Lift"
  background_hum_filter      → "Background Hum Filter"
  speech_cleaner             → "Speech Cleaner"
  loudness_boost_db          → "Loudness Boost"
"""

from __future__ import annotations

from typing import List, Literal, Optional, Union, Annotated

from pydantic import BaseModel, Field


# ── Text overlays ──────────────────────────────────────────────────────────────

class AddTextTrack(BaseModel):
    type: Literal["ADD_TEXT"] = "ADD_TEXT"
    track_id: str = Field(..., min_length=1, max_length=64)
    text: str = Field(..., min_length=1, max_length=200)
    start_us: int = Field(..., ge=0, description="Start timestamp in microseconds")
    duration_us: int = Field(..., ge=100_000, description="Duration ≥ 100ms")
    style_preset: Literal["POP", "KARAOKE", "GLITCH", "CINEMATIC"] = "POP"


class ModifyTextTrack(BaseModel):
    type: Literal["MODIFY_TEXT"] = "MODIFY_TEXT"
    track_id: str = Field(..., min_length=1, max_length=64)
    text: Optional[str] = Field(None, max_length=200)
    style_preset: Optional[Literal["POP", "KARAOKE", "GLITCH", "CINEMATIC"]] = None


class RemoveTextTrack(BaseModel):
    type: Literal["REMOVE_TEXT"] = "REMOVE_TEXT"
    track_id: str = Field(..., min_length=1, max_length=64)


# ── Audio ──────────────────────────────────────────────────────────────────────

class ModifyAudioTrack(BaseModel):
    type: Literal["MODIFY_AUDIO"] = "MODIFY_AUDIO"
    track_id: str = Field(..., min_length=1, max_length=64)
    # Human label: "Vocal Lift"
    vocal_contrast_lift_db: Optional[float] = Field(None, ge=-12.0, le=12.0)
    # Human label: "Background Hum Filter"
    background_hum_filter: Optional[bool] = None
    # Human label: "Speech Cleaner"
    speech_cleaner: Optional[bool] = None
    # Human label: "Loudness Boost"
    loudness_boost_db: Optional[float] = Field(None, ge=-6.0, le=6.0)

    # Friendly labels map — used by frontend to render human-readable summaries
    _LABEL_MAP: dict = {
        "vocal_contrast_lift_db": "Vocal Lift",
        "background_hum_filter": "Background Hum Filter",
        "speech_cleaner": "Speech Cleaner",
        "loudness_boost_db": "Loudness Boost",
    }


# ── Video edits ────────────────────────────────────────────────────────────────

class TrimVideo(BaseModel):
    type: Literal["TRIM_VIDEO"] = "TRIM_VIDEO"
    clip_id: str = Field(..., min_length=1, max_length=64)
    in_us: int = Field(..., ge=0, description="In-point in microseconds")
    out_us: int = Field(..., ge=0, description="Out-point in microseconds")


class AddBRoll(BaseModel):
    type: Literal["ADD_BROLL"] = "ADD_BROLL"
    after_clip_id: str = Field(..., min_length=1, max_length=64)
    source: Literal["PEXELS", "UPLOAD"] = "PEXELS"
    query: Optional[str] = Field(None, max_length=80)
    file_id: Optional[str] = Field(None, max_length=128)
    duration_us: int = Field(3_000_000, ge=500_000, le=15_000_000)


class Reframe(BaseModel):
    type: Literal["REFRAME"] = "REFRAME"
    clip_id: str = Field(..., min_length=1, max_length=64)
    center_x: float = Field(0.5, ge=0.0, le=1.0)
    center_y: float = Field(0.5, ge=0.0, le=1.0)
    scale: float = Field(1.0, ge=0.5, le=3.0)


class ApplyFilter(BaseModel):
    type: Literal["APPLY_FILTER"] = "APPLY_FILTER"
    clip_id: str = Field(..., min_length=1, max_length=64)
    filter: Literal["GRAPE", "APPLE", "ICE", "FIRE", "WARM", "COOL", "NONE"]
    intensity: float = Field(0.5, ge=0.0, le=1.0)


class AddTransition(BaseModel):
    type: Literal["ADD_TRANSITION"] = "ADD_TRANSITION"
    from_clip_id: str = Field(..., min_length=1, max_length=64)
    to_clip_id: str = Field(..., min_length=1, max_length=64)
    transition: Literal["WIPE", "DIP", "GLITCH_WIPE", "FLASH"] = "WIPE"
    duration_us: int = Field(500_000, ge=100_000, le=2_000_000)


# ── Discriminated union ────────────────────────────────────────────────────────

QepPatch = Annotated[
    Union[
        AddTextTrack,
        ModifyTextTrack,
        RemoveTextTrack,
        ModifyAudioTrack,
        TrimVideo,
        AddBRoll,
        Reframe,
        ApplyFilter,
        AddTransition,
    ],
    Field(discriminator="type"),
]

QepPatchList = List[QepPatch]

# Allow-list of all valid action type strings — used for quick set membership check
VALID_ACTION_TYPES: frozenset[str] = frozenset(
    {
        "ADD_TEXT",
        "MODIFY_TEXT",
        "REMOVE_TEXT",
        "MODIFY_AUDIO",
        "TRIM_VIDEO",
        "ADD_BROLL",
        "REFRAME",
        "APPLY_FILTER",
        "ADD_TRANSITION",
    }
)


# ── Director output schema ─────────────────────────────────────────────────────

class DirectorOutput(BaseModel):
    """Typed contract for run_director_pipeline() output.

    Co-pilot rule: requires_user_approval is ALWAYS True.
    The server never auto-applies patches — the UI must show a diff
    and the user must click "Apply".
    """

    intent_summary: str = Field(..., max_length=280)
    patches: QepPatchList
    confidence: float = Field(..., ge=0.0, le=1.0)
    requires_user_approval: bool = True  # Non-negotiable — co-pilot rule
