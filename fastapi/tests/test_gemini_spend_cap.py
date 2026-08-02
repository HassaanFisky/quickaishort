"""Gemini global spend-cap / kill-switch tests."""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import gemini_client  # noqa: E402
from services.gemini_backpressure import RedisGeminiBackpressure  # noqa: E402
from services.gemini_spend_cap import (  # noqa: E402
    GeminiSpendCapError,
    RedisGeminiSpendCap,
)
from services.ai_editor_errors import (  # noqa: E402
    AiEditorErrorKind,
    from_spend_cap,
)


class _FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, object] = {}

    async def get(self, key: str) -> object:
        return self.values.get(key)

    async def incr(self, key: str) -> int:
        value = int(self.values.get(key, 0)) + 1
        self.values[key] = value
        return value

    async def decr(self, key: str) -> int:
        value = int(self.values.get(key, 0)) - 1
        self.values[key] = value
        return value

    async def expire(self, key: str, seconds: int) -> bool:
        _ = key, seconds
        return True


@pytest.mark.asyncio
async def test_kill_switch_blocks_before_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_SPEND_KILL_SWITCH", "true")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.setenv("MOCK_AI_MODE", "false")
    generate = AsyncMock()
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )
    spend = RedisGeminiSpendCap(_FakeRedis(), clock=lambda: 1_700_000_000.0)
    bp = RedisGeminiBackpressure(_FakeRedis(), clock=lambda: 1_700_000_000.0)
    monkeypatch.setattr(gemini_client, "get_client", lambda: client)
    monkeypatch.setattr(gemini_client, "_get_backpressure_guard", lambda: bp)
    monkeypatch.setattr(
        "services.gemini_spend_cap.get_gemini_spend_cap",
        lambda: spend,
    )

    with pytest.raises(GeminiSpendCapError) as excinfo:
        await gemini_client.call_gemini("prompt", max_attempts=1)
    assert excinfo.value.reason == "kill_switch"
    generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_daily_cap_blocks_after_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_SPEND_KILL_SWITCH", "false")
    monkeypatch.setenv("GEMINI_DAILY_CALL_CAP", "2")
    monkeypatch.setenv("GEMINI_HOURLY_CALL_CAP", "100")
    spend = RedisGeminiSpendCap(_FakeRedis(), clock=lambda: 1_700_000_000.0)

    await spend.admit()
    await spend.admit()
    with pytest.raises(GeminiSpendCapError) as excinfo:
        await spend.admit()
    assert excinfo.value.reason == "daily_cap"

    snap = await spend.snapshot()
    assert snap["blocked"] is True
    assert snap["reason"] == "daily_cap"
    assert snap["daily_used"] == 2


@pytest.mark.asyncio
async def test_hourly_cap_does_not_eat_daily_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_SPEND_KILL_SWITCH", "false")
    monkeypatch.setenv("GEMINI_DAILY_CALL_CAP", "50")
    monkeypatch.setenv("GEMINI_HOURLY_CALL_CAP", "1")
    redis = _FakeRedis()
    spend = RedisGeminiSpendCap(redis, clock=lambda: 1_700_000_000.0)

    await spend.admit()
    with pytest.raises(GeminiSpendCapError) as excinfo:
        await spend.admit()
    assert excinfo.value.reason == "hourly_cap"

    snap = await spend.snapshot()
    assert snap["hourly_used"] == 1
    # Daily should remain 1 after hourly reject rolled back the 2nd daily incr.
    assert snap["daily_used"] == 1


def test_from_spend_cap_maps_honest_envelope() -> None:
    err = GeminiSpendCapError(reason="daily_cap", retry_after_seconds=120)
    http = from_spend_cap(err)
    assert http.status_code == 429
    assert isinstance(http.detail, dict)
    assert http.detail["kind"] == AiEditorErrorKind.SPEND_CAP.value
