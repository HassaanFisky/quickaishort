"""Centralized Gemini access using the modern google-genai SDK.

This implementation replaces the deprecated google-generativeai package
to resolve FutureWarnings and ensure long-term compatibility.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Iterable

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Model default from env
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Initialize the modern client
# We use a singleton-like pattern for the client
_client: genai.Client | None = None

def get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY environment variable is not set")
        # Initialize client
        _client = genai.Client(api_key=api_key)
    return _client

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
    max_attempts: int = 5,
) -> Any:
    """Call Gemini using the new SDK with retry logic."""
    client = get_client()
    target_model = model or DEFAULT_MODEL

    # Convert dict config to types.GenerateContentConfig if provided
    config = None
    if generation_config:
        config = types.GenerateContentConfig(**generation_config)

    async def _attempt() -> Any:
        # Note: new SDK uses .aio for async calls
        return await client.aio.models.generate_content(
            model=target_model,
            contents=contents,
            config=config,
        )

    if not _TENACITY_OK:
        return await _attempt()

    # Retry on transient errors (429, 5xx)
    async for attempt in AsyncRetrying(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(max_attempts),
        reraise=True,
    ):
        with attempt:
            return await _attempt()

async def call_gemini_text(
    prompt: str,
    *,
    model: str | None = None,
    json_mode: bool = False,
    max_attempts: int = 5,
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
