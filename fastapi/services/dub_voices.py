"""Curated Google Cloud TTS voices for Dub Video target languages."""

from __future__ import annotations

from typing import Final

# Neural2 voices verified against Google Cloud TTS naming conventions.
# Keep list small for cost predictability and UI clarity.
DUB_VOICE_MAP: Final[dict[str, str]] = {
    "en": "en-US-Neural2-D",
    "es": "es-ES-Neural2-A",
    "fr": "fr-FR-Neural2-A",
    "hi": "hi-IN-Neural2-A",
    "pt": "pt-BR-Neural2-A",
    "de": "de-DE-Neural2-A",
    "ar": "ar-XA-Neural2-A",
    "ur": "ur-IN-Neural2-A",
}

DUB_LANG_LABELS: Final[dict[str, str]] = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "hi": "Hindi",
    "pt": "Portuguese",
    "de": "German",
    "ar": "Arabic",
    "ur": "Urdu",
}


def resolve_voice_id(target_lang: str, override: str | None = None) -> str:
    if override and override.strip():
        return override.strip()
    return DUB_VOICE_MAP.get(target_lang, DUB_VOICE_MAP["en"])


def supported_languages() -> list[dict[str, str]]:
    return [
        {"code": code, "label": DUB_LANG_LABELS[code], "voice_id": voice}
        for code, voice in DUB_VOICE_MAP.items()
        if code != "en"
    ]
