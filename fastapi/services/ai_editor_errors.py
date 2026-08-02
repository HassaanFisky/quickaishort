"""Typed AI Editor error envelopes for HTTP + SSE (trust-honest UX).

Author: QuickAI Engineering
Last modified: 2026-07-27
"""

from __future__ import annotations

import json
from enum import Enum
from typing import Any

from fastapi import HTTPException
from services.gemini_backpressure import Gemini429Kind, GeminiBackpressureError
from services.gemini_spend_cap import GeminiSpendCapError


class AiEditorErrorKind(str, Enum):
    HARD_QUOTA = "hard_quota"
    TRANSIENT = "transient"
    SPEND_CAP = "spend_cap"
    CREDITS = "credits"
    CREDIT_SERVICE = "credit_service"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    INVALID_OUTPUT = "invalid_output"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


def error_detail(
    kind: AiEditorErrorKind | str,
    message: str,
    *,
    retry_after: int | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "kind": kind.value if isinstance(kind, AiEditorErrorKind) else str(kind),
        "message": message,
    }
    if retry_after is not None and retry_after > 0:
        payload["retry_after"] = int(retry_after)
    return payload


def http_error(
    status_code: int,
    kind: AiEditorErrorKind | str,
    message: str,
    *,
    retry_after: int | None = None,
) -> HTTPException:
    headers = (
        {"Retry-After": str(int(retry_after))}
        if retry_after is not None and retry_after > 0
        else None
    )
    return HTTPException(
        status_code=status_code,
        detail=error_detail(kind, message, retry_after=retry_after),
        headers=headers,
    )


def from_backpressure(exc: GeminiBackpressureError) -> HTTPException:
    kind = (
        AiEditorErrorKind.HARD_QUOTA
        if exc.cooldown.kind is Gemini429Kind.HARD_QUOTA
        else AiEditorErrorKind.TRANSIENT
    )
    message = (
        "AI is temporarily unavailable (provider limit). Your timeline edits are safe."
        if kind is AiEditorErrorKind.HARD_QUOTA
        else "AI is briefly rate-limited. Your edits stay on the timeline."
    )
    return http_error(
        429,
        kind,
        message,
        retry_after=exc.cooldown.retry_after_seconds,
    )


def from_spend_cap(exc: GeminiSpendCapError) -> HTTPException:
    """Map global call-budget / kill-switch blocks to an honest UX envelope."""

    if exc.reason == "kill_switch":
        message = (
            "AI spend is paused by the founder kill-switch. "
            "No Gemini call was made — your timeline edits are safe."
        )
    elif exc.reason == "daily_cap":
        message = (
            "Daily AI call budget reached. No further Gemini spend today — "
            "your timeline edits are safe."
        )
    elif exc.reason == "hourly_cap":
        message = (
            "Hourly AI call budget reached. Try again later — "
            "no Gemini call was made."
        )
    else:
        message = "AI spend budget blocked this request. No Gemini call was made."
    return http_error(
        429,
        AiEditorErrorKind.SPEND_CAP,
        message,
        retry_after=exc.retry_after_seconds,
    )


def sse_error_event(
    *,
    kind: AiEditorErrorKind | str,
    message: str,
    status: int,
    retry_after: int | None = None,
) -> str:
    payload = error_detail(kind, message, retry_after=retry_after)
    payload["error"] = message
    payload["status"] = int(status)
    return f"data: {json.dumps(payload)}\n\n"


def detail_message(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        msg = detail.get("message") or detail.get("detail")
        if isinstance(msg, str):
            return msg
        return str(detail)
    return str(detail)
