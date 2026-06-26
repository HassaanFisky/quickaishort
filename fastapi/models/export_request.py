"""Pydantic models for the /api/process-video export request.

Extracted here from main.py so tests can import these models without
triggering the full FastAPI application startup (Redis, Sentry, yt-dlp …).
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from models.render_manifest import RenderManifest


class ReframingPayload(BaseModel):
    center: dict[str, float]
    scale: float = 1.0


class CaptionsPayload(BaseModel):
    enabled: bool = False
    srt_content: str = ""
    style: Optional[str] = None


class CanvasOverlayPayload(BaseModel):
    type: str
    content: str
    x_pct: float
    y_pct: float
    scale: float = 1.0
    rotation: float = 0.0


class ExportRequest(BaseModel):
    videoId: str
    start_sec: float
    end_sec: float
    user_id: str
    runId: Optional[str] = None
    aspect_ratio: Literal["9:16", "1:1"] = "9:16"
    quality: Literal["low", "medium", "high"] = "medium"
    captions: CaptionsPayload = Field(default_factory=CaptionsPayload)
    watermark_enabled: bool = False
    reframing: Optional[ReframingPayload] = None
    canvas_overlays: List[CanvasOverlayPayload] = Field(default_factory=list)
    audio_boost: float = 85.0
    playback_speed: float = 100.0
    noise_suppression: float = 20.0
    filter_name: str = "None"
    transition_enabled: bool = False
    voiceover_enabled: bool = False
    # Phase 59: optional RenderManifest — validated on ingest, stored for future
    # render path use. render_worker.py is not changed by this field.
    render_manifest: Optional[RenderManifest] = Field(
        default=None,
        description=(
            "Compiled RenderManifest from the frontend editor. "
            "Validated and persisted with the job; not yet consumed by the render worker."
        ),
    )
