"""Centralized Gemini access using the modern google-genai SDK.

This implementation replaces the deprecated google-generativeai package
to resolve FutureWarnings and ensure long-term compatibility.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
import os
from types import SimpleNamespace
from typing import Any, Iterable

import httpx

logger = logging.getLogger(__name__)

# Model default from env
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Initialize the modern client
# We use a singleton-like pattern for the client
_client: Any | None = None


def get_genai_types() -> Any:
    """Import google-genai types only on the first active model request."""

    return importlib.import_module("google.genai.types")


def get_client() -> Any:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY environment variable is not set")
        genai = importlib.import_module("google.genai")
        _client = genai.Client(api_key=api_key)
    return _client


def _get_backpressure_guard() -> Any:
    from services.gemini_backpressure import get_gemini_backpressure

    return get_gemini_backpressure()


def _mock_ai_enabled() -> bool:
    from core.flags import is_mock_ai_mode

    return is_mock_ai_mode()


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


async def call_gemini(
    contents: Any,
    *,
    model: str | None = None,
    generation_config: dict[str, Any] | None = None,
    max_attempts: int = 3,
) -> Any:
    """Call Gemini with Redis cooldown and bounded transport-only retries."""
    if not 1 <= max_attempts <= 3:
        raise ValueError("max_attempts must be between 1 and 3")

    # Local developer sandbox: never touch Google AI Studio or Redis cooldown.
    if _mock_ai_enabled():
        from services.gemini_mock import build_mock_gemini_text

        mime = ""
        if generation_config:
            mime = str(generation_config.get("response_mime_type") or "")
        text = build_mock_gemini_text(
            contents,
            json_mode=mime == "application/json",
        )
        logger.info(
            "gemini_mock_short_circuit model=%s bytes=%d",
            model or DEFAULT_MODEL,
            len(text),
        )
        return SimpleNamespace(text=text, model_version="mock-ai-mode")

    guard = _get_backpressure_guard()
    await guard.check()
    client = get_client()
    target_model = model or DEFAULT_MODEL

    # Convert dict config to types.GenerateContentConfig if provided
    config = None
    if generation_config:
        config = get_genai_types().GenerateContentConfig(**generation_config)

    async def _attempt() -> Any:
        # Note: new SDK uses .aio for async calls
        return await client.aio.models.generate_content(
            model=target_model,
            contents=contents,
            config=config,
        )

    async def _execute() -> Any:
        if not _TENACITY_OK:
            return await _attempt()

        # Quota/auth/model errors are deterministic and never enter this retry.
        async for attempt in AsyncRetrying(
            retry=retry_if_exception_type(
                (TimeoutError, ConnectionError, OSError, httpx.TransportError)
            ),
            wait=wait_exponential(multiplier=1, min=1, max=8),
            stop=stop_after_attempt(max_attempts),
            reraise=True,
        ):
            with attempt:
                return await _attempt()
        raise RuntimeError("Gemini retry loop ended without a result")

    try:
        response = await _execute()
    except Exception as exc:
        deferred = await guard.record_429(exc)
        if deferred is not None:
            raise deferred from exc
        raise

    await guard.clear_after_success()
    return response


async def call_gemini_text(
    prompt: str,
    *,
    model: str | None = None,
    json_mode: bool = False,
    max_attempts: int = 3,
) -> str:
    """Returns response.text directly from the prompt."""
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
    """Helper to gather multiple Gemini calls."""
    return await asyncio.gather(*coros, return_exceptions=True)


def __getattr__(name: str) -> Any:
    """Compatibility shim for legacy ``from gemini_client import types`` callers."""

    if name == "types":
        loaded = get_genai_types()
        globals()[name] = loaded
        return loaded
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
