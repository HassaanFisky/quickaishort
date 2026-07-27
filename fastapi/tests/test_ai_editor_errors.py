"""Tests for typed AI editor error envelopes."""

from __future__ import annotations

from services.ai_editor_errors import (
    AiEditorErrorKind,
    error_detail,
    from_backpressure,
    sse_error_event,
)
from services.gemini_backpressure import Gemini429Kind, GeminiBackpressureError, GeminiCooldown


def test_error_detail_includes_kind_and_retry():
    d = error_detail(AiEditorErrorKind.HARD_QUOTA, "unavailable", retry_after=300)
    assert d["kind"] == "hard_quota"
    assert d["retry_after"] == 300


def test_from_backpressure_hard_vs_transient():
    hard = from_backpressure(
        GeminiBackpressureError(
            GeminiCooldown(
                kind=Gemini429Kind.HARD_QUOTA,
                retry_after_seconds=300,
                blocked_until_epoch=1,
            )
        )
    )
    assert hard.status_code == 429
    assert hard.detail["kind"] == "hard_quota"

    transient = from_backpressure(
        GeminiBackpressureError(
            GeminiCooldown(
                kind=Gemini429Kind.TRANSIENT_RATE_LIMIT,
                retry_after_seconds=8,
                blocked_until_epoch=1,
            )
        )
    )
    assert transient.detail["kind"] == "transient"


def test_sse_error_event_json():
    event = sse_error_event(
        kind=AiEditorErrorKind.CREDITS,
        message="out",
        status=402,
    )
    assert event.startswith("data: ")
    assert '"kind": "credits"' in event
    assert '"status": 402' in event
