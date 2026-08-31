"""Dub Video job contracts — translate + TTS + captions pipeline."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

DubMode = Literal["full_dub", "voiceover_only", "captions_only"]
DubStage = Literal[
    "queued",
    "translating",
    "synthesizing",
    "aligning",
    "subtitling",
    "ready",
    "degraded",
    "failed",
    "cancelled",
]
# BCP 47 language tag (e.g. "ur", "ur-PK", "ar-SA"). Historically a fixed
# Literal; now validated against the canonical locale registry at the service
# boundary (services.dub_service) so new languages are data, not code.
DubTargetLang = str

DUB_CREDIT_FULL = 40
DUB_CREDIT_CAPTIONS = 15
DUB_JOB_TTL_SECONDS = 2 * 3600


class DubTranscriptChunk(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=4000)
    start: float = Field(ge=0, le=86_400)
    end: float = Field(ge=0, le=86_400)


class DubSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source_text: str
    translated_text: str
    start: float
    end: float
    timing_adjusted: bool = False
    tts_cache_key: Optional[str] = None


class DubJobCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcript: list[DubTranscriptChunk] = Field(min_length=1, max_length=500)
    target_lang: DubTargetLang
    # Source speech language. Defaults to English: the configured ASR
    # (whisper-tiny.en) is English-only per ADR-014. This field makes the
    # assumption explicit so a future multilingual ASR is a data change.
    source_lang: Optional[str] = Field(default="en", max_length=35)
    mode: DubMode = "full_dub"
    voice_id: Optional[str] = Field(default=None, max_length=128)
    project_id: Optional[str] = Field(default=None, max_length=128)
    source_fingerprint: Optional[str] = Field(default=None, max_length=128)
    run_id: Optional[str] = Field(default=None, max_length=256)


class DubJobStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    user_id: str
    status: DubStage
    mode: DubMode
    target_lang: DubTargetLang
    voice_id: str
    progress: float = Field(ge=0, le=100)
    message: str = ""
    fingerprint: str
    segments: list[DubSegment] = Field(default_factory=list)
    translated_srt: str = ""
    dub_audio_uri: Optional[str] = None
    preview_audio_url: Optional[str] = None
    mute_source_audio: bool = False
    fallback_reason: Optional[str] = None
    error: Optional[str] = None
    cache_hit: bool = False
    credits_charged: int = Field(default=0, ge=0, le=10_000)
    created_at: float
    updated_at: float


class DubTaskPayload(BaseModel):
    """Cloud Tasks / RQ payload for worker-side synthesize+align."""

    model_config = ConfigDict(extra="forbid", strict=True)

    job_id: str = Field(min_length=1, max_length=256)
    user_id: str = Field(min_length=1, max_length=256)
    run_id: str = Field(default="", max_length=256)
