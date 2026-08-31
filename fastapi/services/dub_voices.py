"""Curated Google Cloud TTS voices for Dub Video target languages.

Derived from the canonical locale registry (``services.locale_registry``) — the
registry is the single source of truth for language capability; this module is
a thin adapter exposing the historical, stable API surface (``DUB_VOICE_MAP``,
``DUB_LANG_LABELS``, ``resolve_voice_id``, ``supported_languages``).
"""

from __future__ import annotations

from typing import Final

from services.locale_registry import get_locale_registry


# A dub target language must be both translatable (Gemini) AND speakable
# (a configured Google Cloud TTS voice). This keeps Dub Video honest: we never
# offer "voice" for a language the configured provider cannot synthesize.
def _build_maps() -> tuple[dict[str, str], dict[str, str]]:
    registry = get_locale_registry()
    voices: dict[str, str] = {}
    labels: dict[str, str] = {}
    seen_languages: set[str] = set()
    for entry in registry.locales():
        if not entry.speech or not entry.translation or not entry.voice_id:
            continue
        # Prefer the base-language entry; region variants share the same voice.
        if entry.language in seen_languages:
            continue
        seen_languages.add(entry.language)
        voices[entry.language] = entry.voice_id
        labels[entry.language] = entry.display_name
    return voices, labels


DUB_VOICE_MAP: Final[dict[str, str]]
DUB_LANG_LABELS: Final[dict[str, str]]
DUB_VOICE_MAP, DUB_LANG_LABELS = _build_maps()


def resolve_voice_id(target_lang: str, override: str | None = None) -> str:
    """Resolve a target language to a configured TTS voice (override wins).

    Accepts BCP 47 tags (``ur-PK``) and base language codes (``ur``) alike,
    resolving through the registry fallback chain.
    """
    if override and override.strip():
        return override.strip()
    registry = get_locale_registry()
    voice = registry.voice_id_for(target_lang)
    if voice:
        return voice
    return registry.voice_id_for(registry.default_locale) or "en-US-Neural2-D"


def supported_languages() -> list[dict[str, str]]:
    """Dub target languages (excludes the source language ``en``)."""
    return [
        {"code": code, "label": DUB_LANG_LABELS[code], "voice_id": voice}
        for code, voice in DUB_VOICE_MAP.items()
        if code != "en"
    ]
