"""Centralized Gemini access with exponential-backoff retries.

Two surfaces:
  - DEFAULT_MODEL: read once from the GEMINI_MODEL env var (default
    `gemini-2.5-flash`). Both agents read this so the model can be swapped
    via env without touching code.
  - call_gemini(): a thin wrapper around `google.generativeai`'s async API
    that retries on 429 / 5xx / deadline exceeded using tenacity.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Iterable

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

try:
    import google.generativeai as genai
    from google.api_core.exceptions import (
        DeadlineExceeded,
        InternalServerError,
        ResourceExhausted,
        ServiceUnavailable,
    )

    _GENAI_OK = True
    RETRYABLE_EXCEPTIONS: tuple[type[BaseException], ...] = (
        ResourceExhausted,
        ServiceUnavailable,
        DeadlineExceeded,
        InternalServerError,
    )
except ImportError as exc:
    logger.warning("google-generativeai unavailable (%s) — Gemini calls disabled.", exc)
    genai = None  # type: ignore[assignment]
    _GENAI_OK = False
    RETRYABLE_EXCEPTIONS = (Exception,)

try:
    from tenacity import (
        AsyncRetrying,
        retry_if_exception_type,
        stop_after_attempt,
        wait_exponential,
    )

    _TENACITY_OK = True
except ImportError:
    logger.warning("tenacity unavailable — Gemini calls will not retry.")
    _TENACITY_OK = False


_configured = False


def _ensure_configured() -> None:
    global _configured
    if _configured or not _GENAI_OK:
        return
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set — Gemini calls will fail.")
        return
    genai.configure(api_key=api_key)
    _configured = True


async def call_gemini(
    contents: Any,
    *,
    model: str | None = None,
    generation_config: dict[str, Any] | None = None,
    max_attempts: int = 5,
) -> Any:
    """Call `model.generate_content_async(contents)` with retry on transient errors.

    Returns the raw response object so callers can inspect .text, parts, etc.
    """
    if not _GENAI_OK:
        raise RuntimeError("google-generativeai is not installed.")
    _ensure_configured()

    target_model = model or DEFAULT_MODEL
    gm = genai.GenerativeModel(target_model)

    async def _attempt() -> Any:
        return await gm.generate_content_async(
            contents,
            generation_config=generation_config,
        )

    if not _TENACITY_OK:
        return await _attempt()

    async for attempt in AsyncRetrying(
        retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(max_attempts),
        reraise=True,
    ):
        with attempt:
            return await _attempt()

    raise RuntimeError("Gemini call exhausted retries without raising — unreachable")


async def call_gemini_text(
    prompt: str,
    *,
    model: str | None = None,
    json_mode: bool = False,
    max_attempts: int = 5,
) -> str:
    """Convenience wrapper that returns response.text directly."""
    config: dict[str, Any] = {}
    if json_mode:
        config["response_mime_type"] = "application/json"
    response = await call_gemini(
        prompt,
        model=model,
        generation_config=config or None,
        max_attempts=max_attempts,
    )
    return getattr(response, "text", "") or ""


async def gather_with_retries(coros: Iterable[asyncio.Future | asyncio.Task]) -> list:
    """Helper to gather multiple Gemini calls — preserves errors per-call."""
    return await asyncio.gather(*coros, return_exceptions=True)
