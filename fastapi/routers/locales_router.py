"""Globalization API — canonical locale capability discovery (cross-client).

Consumers (web, mobile, desktop, extension) read locale capability from the
single canonical registry instead of hard-coding language lists. No user data
is exposed — this is pure capability metadata, mirroring EP-001's registry
philosophy for language/locale.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from core.rate_limit import limiter
from services.locale_registry import (
    LocaleCapability,
    get_locale_registry,
    is_valid_bcp47,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studio/v1/locales", tags=["studio-locales"])


def _row(entry: LocaleCapability) -> dict:
    return {
        "id": entry.id,
        "language": entry.language,
        "script": entry.script,
        "region": entry.region,
        "direction": entry.direction,
        "displayName": entry.display_name,
        "nativeName": entry.native_name,
        "enabled": entry.enabled,
        "ui": entry.ui,
        "input": entry.input,
        "speech": entry.speech,
        "transcription": entry.transcription,
        "translation": entry.translation,
        "captions": entry.captions,
        "output": entry.output,
        "voiceId": entry.voice_id,
        "fallback": entry.fallback,
    }


@router.get("")
@limiter.limit("120/minute")
async def list_locales(request: Request) -> dict:
    """Full locale capability registry (structured, BCP 47)."""
    _ = request
    return get_locale_registry().as_payload()


@router.get("/{tag}")
@limiter.limit("120/minute")
async def get_locale(request: Request, tag: str) -> dict:
    """Resolve one BCP 47 tag against the registry, applying fallback."""
    _ = request
    registry = get_locale_registry()
    if not is_valid_bcp47(tag):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_LOCALE",
                "message": f"{tag!r} is not a valid BCP 47 language tag.",
            },
        )
    resolved = registry.resolve(tag)
    exact = registry.get(tag) is not None
    return {
        "requested": tag,
        "resolved": resolved.id,
        "fallbackApplied": not exact,
        "fallbackChain": registry.fallback_chain(tag),
        "locale": _row(resolved),
    }
