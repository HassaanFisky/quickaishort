"""Unit tests for Dub Video translate + credits + job state machine."""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.dub import (  # noqa: E402
    DUB_CREDIT_CAPTIONS,
    DUB_CREDIT_FULL,
    DubJobCreateRequest,
    DubTranscriptChunk,
)
from services.dub_service import (  # noqa: E402
    compute_fingerprint,
    credit_cost_for_mode,
)
from services.dub_translate import (  # noqa: E402
    segments_to_srt,
    translate_segments,
    translation_cache_key,
)
from services.dub_voices import resolve_voice_id, supported_languages  # noqa: E402


def test_credit_cost_by_mode():
    assert credit_cost_for_mode("captions_only") == DUB_CREDIT_CAPTIONS
    assert credit_cost_for_mode("full_dub") == DUB_CREDIT_FULL
    assert credit_cost_for_mode("voiceover_only") == DUB_CREDIT_FULL


def test_voice_resolution():
    assert resolve_voice_id("es").startswith("es-")
    assert resolve_voice_id("ur", "custom-voice") == "custom-voice"
    langs = supported_languages()
    assert all(row["code"] != "en" for row in langs)
    assert {row["code"] for row in langs} >= {"es", "fr", "hi", "ur"}


def test_fingerprint_stable_and_sensitive():
    chunks = [
        DubTranscriptChunk(text="Hello world", start=0.0, end=1.2),
        DubTranscriptChunk(text="Next line", start=1.2, end=2.4),
    ]
    a = DubJobCreateRequest(transcript=chunks, target_lang="es", mode="full_dub")
    b = DubJobCreateRequest(transcript=chunks, target_lang="es", mode="full_dub")
    c = DubJobCreateRequest(transcript=chunks, target_lang="fr", mode="full_dub")
    voice = resolve_voice_id("es")
    assert compute_fingerprint(a, voice) == compute_fingerprint(b, voice)
    assert compute_fingerprint(a, voice) != compute_fingerprint(
        c, resolve_voice_id("fr")
    )


def test_translation_cache_key_changes_with_lang():
    chunks = [DubTranscriptChunk(text="Hi", start=0, end=1)]
    assert translation_cache_key(chunks, "es") != translation_cache_key(chunks, "fr")


@pytest.mark.asyncio
async def test_mock_translate_and_srt(monkeypatch):
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    # Reset flag cache if any
    from core import flags

    if hasattr(flags, "MOCK_AI_MODE"):
        monkeypatch.setattr(flags, "MOCK_AI_MODE", True, raising=False)
    monkeypatch.setattr(flags, "is_mock_ai_mode", lambda: True)

    chunks = [
        DubTranscriptChunk(text="Hello", start=0.0, end=1.0),
        DubTranscriptChunk(text="World", start=1.0, end=2.0),
    ]
    segs = await translate_segments(chunks, "es")
    assert len(segs) == 2
    assert "Hello" in segs[0].translated_text
    srt = segments_to_srt(segs)
    assert "00:00:00,000" in srt
    assert "Hello" in srt


@pytest.mark.asyncio
async def test_captions_only_skips_tts(monkeypatch):
    from services import dub_service

    class _FakeRedis:
        def __init__(self):
            self.values: dict[str, object] = {}

        def get(self, key: str):
            return self.values.get(key)

        def setex(self, key: str, _ttl: int, value: object):
            self.values[key] = value
            return True

    fake = _FakeRedis()
    monkeypatch.setattr(dub_service, "_redis", lambda: fake)
    monkeypatch.setattr(dub_service, "is_cancelled", lambda _jid: False)
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    from core import flags

    monkeypatch.setattr(flags, "is_mock_ai_mode", lambda: True)

    req = DubJobCreateRequest(
        transcript=[DubTranscriptChunk(text="Hello friends", start=0, end=1.5)],
        target_lang="es",
        mode="captions_only",
    )
    job = await dub_service.create_job(req, "user-1")
    assert job.status == "queued"
    # Store request already done by create_job
    result = await dub_service.process_dub_job(job.job_id)
    assert result.status == "ready"
    assert result.mute_source_audio is False
    assert result.translated_srt
    assert result.dub_audio_uri is None


@pytest.mark.asyncio
async def test_tts_unavailable_degrades(monkeypatch):
    from services import dub_service

    class _FakeRedis:
        def __init__(self):
            self.values: dict[str, object] = {}

        def get(self, key: str):
            return self.values.get(key)

        def setex(self, key: str, _ttl: int, value: object):
            self.values[key] = value
            return True

    fake = _FakeRedis()
    monkeypatch.setattr(dub_service, "_redis", lambda: fake)
    monkeypatch.setattr(dub_service, "is_cancelled", lambda _jid: False)
    from core import flags

    monkeypatch.setattr(flags, "is_mock_ai_mode", lambda: True)

    # Force TTS missing key
    fake_tts = MagicMock()
    fake_tts.google_api_key = None
    monkeypatch.setattr("services.tts_service.get_tts_service", lambda: fake_tts)

    req = DubJobCreateRequest(
        transcript=[DubTranscriptChunk(text="Hello", start=0, end=1)],
        target_lang="es",
        mode="full_dub",
    )
    job = await dub_service.create_job(req, "user-2")
    result = await dub_service.process_dub_job(job.job_id)
    assert result.status == "degraded"
    assert result.fallback_reason == "tts_unavailable"
    assert result.translated_srt


def test_registry_contains_dub_capabilities():
    from services.tool_registry import get_capability, load_registry

    load_registry()
    dub = get_capability("DUB_VIDEO")
    caps = get_capability("TRANSLATE_CAPTIONS")
    assert dub is not None
    assert caps is not None
    assert dub["runtime_status"] == "wired"
    assert dub["orchestrator_emit"] is False


@pytest.mark.asyncio
async def test_dub_cache_hit_skips_credit_charge(monkeypatch):
    """Reused ready/degraded jobs must not deduct credits."""
    from routers import dub_router
    from models.dub import DubJobStatus
    from starlette.requests import Request

    ready = DubJobStatus(
        job_id="cached1",
        user_id="u-cache",
        status="ready",
        mode="captions_only",
        target_lang="es",
        voice_id="es-ES-Standard-A",
        progress=100,
        message="Ready",
        fingerprint="fp-test",
        cache_hit=True,
        created_at=1.0,
        updated_at=1.0,
    )
    deduct = AsyncMock(return_value=True)
    dispatch = AsyncMock()
    monkeypatch.setattr(dub_router, "create_job", AsyncMock(return_value=ready))
    monkeypatch.setattr(dub_router, "dispatch_dub_processing", dispatch)
    monkeypatch.setattr("services.stats_service.deduct_credits", deduct)

    req = DubJobCreateRequest(
        transcript=[DubTranscriptChunk(text="Hello", start=0, end=1)],
        target_lang="es",
        mode="captions_only",
    )
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/studio/v1/dub",
        "raw_path": b"/api/studio/v1/dub",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
    }
    out = await dub_router.start_dub_job(
        Request(scope),
        body=req,
        verified_user_id="u-cache",
    )
    assert out.cache_hit is True
    deduct.assert_not_awaited()
    dispatch.assert_not_awaited()
