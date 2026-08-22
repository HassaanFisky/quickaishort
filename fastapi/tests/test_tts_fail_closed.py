"""Fail-closed TTS: extra paid SaaS stays off unless founder-enabled."""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.tts_service import TTSService  # noqa: E402


@pytest.mark.asyncio
async def test_elevenlabs_blocked_without_founder_flag(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_ENABLED", raising=False)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "sk-test-not-real")

    svc = TTSService()
    svc.storage = MagicMock()
    svc.storage.exists_async = AsyncMock(return_value=False)
    svc._generate_elevenlabs = AsyncMock(
        side_effect=AssertionError("must not call extra paid TTS")
    )

    result = await svc.generate("hello", voice_id="voice-a", provider="elevenlabs")
    assert result is None
    svc._generate_elevenlabs.assert_not_awaited()


@pytest.mark.asyncio
async def test_google_tts_missing_key_returns_none(monkeypatch, tmp_path):
    monkeypatch.delenv("GOOGLE_TTS_API_KEY", raising=False)
    svc = TTSService()
    svc.google_api_key = None
    out = await svc._generate_google("hello", "en-US-Neural2-D", tmp_path / "x.mp3")
    assert out is None


@pytest.mark.asyncio
async def test_elevenlabs_allowed_when_founder_flag(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_ENABLED", "true")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "sk-test-not-real")
    svc = TTSService()
    svc.storage = MagicMock()
    svc.storage.exists_async = AsyncMock(return_value=False)
    svc.storage.upload_file_async = AsyncMock(
        return_value="gs://bucket/tts_cache/x.mp3"
    )
    svc._generate_elevenlabs = AsyncMock(return_value="/tmp/fake.mp3")

    result = await svc.generate("hello", voice_id="voice-a", provider="elevenlabs")
    assert result == "gs://bucket/tts_cache/x.mp3"
    svc._generate_elevenlabs.assert_awaited_once()
