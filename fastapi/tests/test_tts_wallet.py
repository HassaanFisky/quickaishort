"""Wallet gates for optional cloud TTS — no paid HTTP when locked or unset."""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.tts_service import (  # noqa: E402
    TTSService,
    cloud_tts_skip_reason,
)


def test_cloud_tts_skip_reason_spend_lock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_SPEND_KILL_SWITCH", "true")
    monkeypatch.setenv("GOOGLE_TTS_API_KEY", "present")
    assert cloud_tts_skip_reason() == "spend_lock"


def test_cloud_tts_skip_reason_open(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_SPEND_KILL_SWITCH", "false")
    assert cloud_tts_skip_reason() is None


@pytest.mark.asyncio
async def test_tts_generate_skips_http_on_spend_lock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SPEND_KILL_SWITCH", "true")
    monkeypatch.setenv("GOOGLE_TTS_API_KEY", "present-but-locked")

    svc = TTSService()
    svc.google_api_key = "present-but-locked"
    svc.storage = MagicMock()
    svc.storage.exists_async = AsyncMock(return_value=False)
    svc._generate_google = AsyncMock()  # type: ignore[method-assign]

    result = await svc.generate("hello wallet")
    assert result is None
    svc._generate_google.assert_not_awaited()


@pytest.mark.asyncio
async def test_tts_generate_skips_http_when_key_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SPEND_KILL_SWITCH", "false")
    monkeypatch.delenv("GOOGLE_TTS_API_KEY", raising=False)

    svc = TTSService()
    svc.google_api_key = None
    svc.storage = MagicMock()
    svc.storage.exists_async = AsyncMock(return_value=False)
    svc._generate_google = AsyncMock()  # type: ignore[method-assign]

    result = await svc.generate("hello")
    assert result is None
    svc._generate_google.assert_not_awaited()
