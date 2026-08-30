"""Canonical language/locale registry — single source of truth for locale capability.

The registry data lives in ``fastapi/capabilities/locales.v1.json`` (mirrored to
``frontend/src/lib/generated/locales.v1.json``). This module is the *only* loader:
every consumer (API validation, AI prompt building, dub language resolution,
media language metadata) resolves locale capability through it.

Design constraints
------------------
* **BCP 47 identifiers.** Tags are structurally validated and canonically cased
  (language lower, script Title, region UPPER) per Unicode CLDR conventions.
* **Language ≠ script ≠ direction.** Each entry carries ``language`` (ISO 639),
  ``script`` (ISO 15924), ``region`` (ISO 3166-1) and ``direction`` separately.
* **Deterministic fallback.** ``resolve("fr-CA")`` → ``fr`` → ``en`` (product
  default). There is exactly one fallback policy, shared by frontend/backend.
* **Honest capabilities.** ``transcription`` is only ``True`` where the configured
  ASR actually supports it (browser Whisper ``tiny.en`` is English-only per
  ADR-014). ``speech`` is only ``True`` where a Google Cloud TTS voice exists in
  the configured voice map. Never over-claim.

This module is intentionally stdlib-only so its tests run without the full app.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

DEFAULT_LOCALE = "en"

_LOCALES_PATH = (
    Path(__file__).resolve().parent.parent / "capabilities" / "locales.v1.json"
)

# ── BCP 47 (RFC 5646) structural grammar, permissive enough for real-world tags.
_ALPHA = "[A-Za-z]"
_DIGIT = "[0-9]"
_ALNUM = "[A-Za-z0-9]"
_LANGUAGE = f"(?:{_ALPHA}{{2,3}}|{_ALPHA}{{4}}|{_ALPHA}{{5,8}})"
_SCRIPT = f"{_ALPHA}{{4}}"
_REGION = f"(?:{_ALPHA}{{2}}|{_DIGIT}{{3}})"
_VARIANT = f"(?:{_ALNUM}{{5,8}}|{_DIGIT}{_ALNUM}{{3}})"
_EXTENSION = f"(?:{_DIGIT}|[A-WY-Za-wy-z])(?:-{_ALNUM}{{2,8}})+"
_PRIVATEUSE = f"x(?:-{_ALNUM}{{1,8}})+"

_BCP47_RE = re.compile(
    rf"^{_LANGUAGE}"
    rf"(?:-{_SCRIPT})?"
    rf"(?:-{_REGION})?"
    rf"(?:-{_VARIANT})*"
    rf"(?:-{_EXTENSION})*"
    rf"(?:-{_PRIVATEUSE})?$"
)

# ISO 15924 script code → intrinsic (default) text direction. Only used when a
# tag is structurally valid but not present in the registry, so we never guess
# "language == RTL". RTL scripts per W3C/CLDR supplementary data.
_RTL_SCRIPTS = frozenset(
    {
        "Arab",  # Arabic
        "Hebr",  # Hebrew
        "Thaa",  # Thaana
        "Nkoo",  # N'Ko
        "Adlm",  # Adlam
        "Rohg",  # Hanifi Rohingya
        "Syrc",  # Syriac
        "Samr",  # Samaritan
        "Mand",  # Mandaic
        "Mend",  # Mende Kikakui
    }
)


@dataclass(frozen=True)
class LocaleCapability:
    """One locale's capability + metadata row, resolved from the registry."""

    id: str
    language: str
    script: Optional[str]
    region: Optional[str]
    direction: str
    display_name: str
    native_name: str
    enabled: bool
    ui: bool
    input: bool
    speech: bool
    transcription: bool
    translation: bool
    captions: bool
    output: bool
    voice_id: Optional[str]
    fallback: Optional[str]
    message_bundle: Optional[str]


def _canonical_subtags(tag: str) -> Optional[str]:
    """Canonically case a structurally-valid BCP 47 tag.

    CLDR casing: language → lower, script → Title, region → UPPER, all other
    subtags → lower. Returns None when the tag fails structural validation.
    """
    if not tag or not _BCP47_RE.match(tag):
        return None
    parts = tag.split("-")
    out = [parts[0].lower()]
    for part in parts[1:]:
        if len(part) == 4 and part.isalpha():
            out.append(part[0].upper() + part[1:].lower())  # script
        elif len(part) == 2 and part.isalpha():
            out.append(part.upper())  # region
        elif len(part) == 3 and part.isdigit():
            out.append(part)  # numeric region (UN M.49)
        else:
            out.append(part.lower())  # variant / extension / singleton
    return "-".join(out)


def is_valid_bcp47(tag: str) -> bool:
    """Structural BCP 47 validation (RFC 5646 grammar), case-insensitive."""
    return bool(tag) and _BCP47_RE.match(tag) is not None


@lru_cache(maxsize=512)
def canonicalize(tag: str) -> Optional[str]:
    """Return the canonically-cased BCP 47 tag, or None if invalid."""
    return _canonical_subtags(tag.strip() if isinstance(tag, str) else "")


@lru_cache(maxsize=512)
def parse_tag(tag: str) -> Optional[dict[str, str]]:
    """Decompose a structurally-valid tag into language/script/region subtags."""
    if not is_valid_bcp47(tag):
        return None
    parts = tag.split("-")
    lang = parts[0].lower()
    script: Optional[str] = None
    region: Optional[str] = None
    for part in parts[1:]:
        if script is None and len(part) == 4 and part.isalpha():
            script = part[0].upper() + part[1:].lower()
        elif region is None and (
            (len(part) == 2 and part.isalpha()) or (len(part) == 3 and part.isdigit())
        ):
            region = part.upper()
    return {"language": lang, "script": script, "region": region}


class LocaleRegistry:
    """Immutable, in-memory registry built once from the canonical JSON."""

    def __init__(
        self, entries: list[dict[str, Any]], default_locale: str = DEFAULT_LOCALE
    ) -> None:
        self.default_locale = default_locale
        self._by_tag: dict[str, LocaleCapability] = {}
        seen: set[str] = set()
        for raw in entries:
            tag = str(raw["id"])
            canon = canonicalize(tag)
            if canon is None or canon in seen:
                raise ValueError(f"invalid or duplicate locale id: {tag!r}")
            seen.add(canon)
            self._by_tag[canon] = LocaleCapability(
                id=canon,
                language=str(raw.get("language", "")).lower(),
                script=raw.get("script") or None,
                region=raw.get("region") or None,
                direction=str(raw.get("direction", "ltr")).lower(),
                display_name=str(raw.get("displayName", canon)),
                native_name=str(raw.get("nativeName", canon)),
                enabled=bool(raw.get("enabled", True)),
                ui=bool(raw.get("ui", False)),
                input=bool(raw.get("input", False)),
                speech=bool(raw.get("speech", False)),
                transcription=bool(raw.get("transcription", False)),
                translation=bool(raw.get("translation", False)),
                captions=bool(raw.get("captions", False)),
                output=bool(raw.get("output", False)),
                voice_id=raw.get("voiceId") or None,
                fallback=raw.get("fallback") or None,
                message_bundle=raw.get("messageBundle") or None,
            )
        if self.default_locale not in self._by_tag:
            raise ValueError(
                f"default locale {self.default_locale!r} missing from registry"
            )

    # ── lookup ──────────────────────────────────────────────────────────────
    def get(self, tag: str) -> Optional[LocaleCapability]:
        """Exact registry lookup by canonical tag. Returns None if unknown."""
        canon = canonicalize(tag)
        return self._by_tag.get(canon) if canon else None

    def resolve(self, tag: Optional[str]) -> LocaleCapability:
        """Deterministic resolution: exact → fallback chain → default locale.

        Unknown-but-valid tags degrade to their language subtag when that
        language is registered, then to the product default. Never returns None.
        """
        if not tag:
            return self._by_tag[self.default_locale]
        entry = self.get(tag)
        if entry is not None:
            return entry
        # Walk the standard fallback chain: tag → language subtag → default.
        for candidate in fallback_chain(tag):
            entry = self.get(candidate)
            if entry is not None:
                return entry
        return self._by_tag[self.default_locale]

    def fallback_chain(self, tag: Optional[str]) -> list[str]:
        """[tag, language-subtag, default] — the single shared fallback policy."""
        return fallback_chain(tag, default_locale=self.default_locale)

    # ── derived metadata ────────────────────────────────────────────────────
    def direction_for(self, tag: Optional[str]) -> str:
        """Explicit/derived text direction (registry first, script fallback)."""
        if tag:
            entry = self.get(tag)
            if entry is not None:
                return entry.direction
            parsed = parse_tag(tag)
            if parsed and parsed.get("script") in _RTL_SCRIPTS:
                return "rtl"
        return "ltr"

    def script_for(self, tag: Optional[str]) -> Optional[str]:
        entry = self.get(tag) if tag else None
        if entry is not None:
            return entry.script
        parsed = parse_tag(tag) if tag else None
        return parsed.get("script") if parsed else None

    def language_of(self, tag: Optional[str]) -> Optional[str]:
        entry = self.get(tag) if tag else None
        if entry is not None:
            return entry.language
        parsed = parse_tag(tag) if tag else None
        return parsed.get("language") if parsed else None

    def voice_id_for(self, tag: Optional[str]) -> Optional[str]:
        entry = self.resolve(tag)
        return entry.voice_id

    # ── capability queries (resolved through fallback) ──────────────────────
    def supports(self, tag: Optional[str], capability: str) -> bool:
        return bool(getattr(self.resolve(tag), capability, False))

    def supports_ui(self, tag: Optional[str]) -> bool:
        return self.supports(tag, "ui")

    def supports_transcription(self, tag: Optional[str]) -> bool:
        return self.supports(tag, "transcription")

    def supports_translation(self, tag: Optional[str]) -> bool:
        return self.supports(tag, "translation")

    def supports_speech(self, tag: Optional[str]) -> bool:
        return self.supports(tag, "speech")

    def supports_input(self, tag: Optional[str]) -> bool:
        return self.supports(tag, "input")

    # ── listing ─────────────────────────────────────────────────────────────
    def locales(self, *, enabled_only: bool = True) -> list[LocaleCapability]:
        rows = [e for e in self._by_tag.values() if (not enabled_only) or e.enabled]
        return sorted(rows, key=lambda e: e.id)

    def ui_locales(self) -> list[LocaleCapability]:
        return [e for e in self.locales() if e.ui]

    def translatable_language_codes(self) -> list[str]:
        """Language codes usable as a dub/translation target (BCP-47 base)."""
        return sorted({e.language for e in self.locales() if e.translation})

    def speech_language_codes(self) -> list[str]:
        return sorted({e.language for e in self.locales() if e.speech})

    def as_payload(self) -> dict[str, Any]:
        """Structured public payload for API clients."""

        def row(e: LocaleCapability) -> dict[str, Any]:
            return {
                "id": e.id,
                "language": e.language,
                "script": e.script,
                "region": e.region,
                "direction": e.direction,
                "displayName": e.display_name,
                "nativeName": e.native_name,
                "enabled": e.enabled,
                "ui": e.ui,
                "input": e.input,
                "speech": e.speech,
                "transcription": e.transcription,
                "translation": e.translation,
                "captions": e.captions,
                "output": e.output,
                "voiceId": e.voice_id,
                "fallback": e.fallback,
            }

        return {
            "schemaVersion": 1,
            "defaultLocale": self.default_locale,
            "locales": [row(e) for e in self.locales()],
        }


def fallback_chain(
    tag: Optional[str], *, default_locale: str = DEFAULT_LOCALE
) -> list[str]:
    """The single, deterministic locale fallback policy.

    ``fr-CA`` → ``[fr-CA, fr, en]``. Frontend and backend MUST share this.
    """
    if not tag:
        return [default_locale]
    canon = canonicalize(tag)
    chain: list[str] = []
    if canon:
        chain.append(canon)
    parsed = parse_tag(tag) if canon else None
    if parsed and parsed.get("language"):
        lang = parsed["language"]
        if lang not in chain:
            chain.append(lang)
    if default_locale not in chain:
        chain.append(default_locale)
    return chain


_registry: Optional[LocaleRegistry] = None


def get_locale_registry() -> LocaleRegistry:
    """Process-wide singleton (lazy, cached)."""
    global _registry
    if _registry is None:
        data = json.loads(_LOCALES_PATH.read_text(encoding="utf-8"))
        _registry = LocaleRegistry(
            data["locales"], default_locale=data.get("defaultLocale", DEFAULT_LOCALE)
        )
    return _registry
