"""Globalization architecture tests — canonical locale registry.

Covers BCP 47 validation/canonicalization, deterministic fallback, script vs
direction vs language separation, honest capability flags, and the invariant
that the registry is the single source of truth (loadable, no duplicates).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.locale_registry import (
    LocaleRegistry,
    canonicalize,
    fallback_chain,
    get_locale_registry,
    is_valid_bcp47,
    parse_tag,
)

LOCALES_PATH = Path(__file__).resolve().parents[1] / "capabilities" / "locales.v1.json"


@pytest.fixture(scope="module")
def registry() -> LocaleRegistry:
    return get_locale_registry()


# ── BCP 47 validation ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "tag",
    [
        "en",
        "en-US",
        "en-GB",
        "ur-PK",
        "ar-SA",
        "zh-Hans",
        "zh-Hant",
        "sr-Cyrl",
        "sr-Latn",
        "es",
        "fr",
        "hi",
        "de",
        "pt",
        "he",
        "fa",
        "ja",
    ],
)
def test_valid_bcp47_tags(tag):
    assert is_valid_bcp47(tag), f"{tag} should be valid BCP 47"


@pytest.mark.parametrize(
    "tag",
    [
        "",
        " ",
        "en_US",
        "e",
        "en-",
        "-en",
        "e1",
        "en--US",
        "en US",
        "en.US",
        "en-US-*",
        "ENGLISH LONG",
        "123",
        "en-💥",
    ],
)
def test_invalid_bcp47_tags(tag):
    assert not is_valid_bcp47(tag), f"{tag!r} should be invalid BCP 47"


def test_reserved_language_shape_is_structurally_valid_but_unknown():
    # "english" matches the RFC 5646 5–8 letter language grammar. Structural
    # validation accepts it; semantic registry resolution degrades it to the
    # default locale (never a crash, never a raw string to the user).
    assert is_valid_bcp47("english") is True
    assert get_locale_registry().resolve("english").id == "en"


# ── Canonical casing (CLDR conventions) ───────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("EN-us", "en-US"),
        ("ZH-hans", "zh-Hans"),
        ("ur-PK", "ur-PK"),
        ("sr-CYRL", "sr-Cyrl"),
        ("en-GB", "en-GB"),
        ("ar-sa", "ar-SA"),
    ],
)
def test_canonicalize_casing(raw, expected):
    assert canonicalize(raw) == expected


def test_canonicalize_invalid_returns_none():
    assert canonicalize("not_a_tag!") is None


# ── Deterministic fallback ────────────────────────────────────────────────────


def test_fallback_chain_region_variant():
    assert fallback_chain("fr-CA") == ["fr-CA", "fr", "en"]


def test_fallback_chain_script_variant():
    assert fallback_chain("zh-Hant") == ["zh-Hant", "zh", "en"]


def test_fallback_chain_default_when_none():
    assert fallback_chain(None) == ["en"]


def test_resolve_unknown_degrades_to_language(registry):
    assert registry.resolve("fr-CA").id == "fr"


def test_resolve_unknown_degrades_to_default(registry):
    assert registry.resolve("xx-ZZ").id == "en"


def test_resolve_none_returns_default(registry):
    assert registry.resolve(None).id == "en"


def test_resolve_exact(registry):
    assert registry.resolve("ur-PK").id == "ur-PK"


# ── Language / script / region / direction separation ─────────────────────────


def test_script_is_first_class(registry):
    assert registry.script_for("zh-Hans") == "Hans"
    assert registry.script_for("zh-Hant") == "Hant"
    assert registry.script_for("sr-Cyrl") == "Cyrl"
    assert registry.script_for("sr-Latn") == "Latn"


def test_language_does_not_imply_direction(registry):
    # Arabic and Urdu are RTL, but the *language code alone* is not the rule:
    # direction is explicit metadata, and unknown tags derive from script only.
    assert registry.direction_for("ar") == "rtl"
    assert registry.direction_for("ur") == "rtl"
    assert registry.direction_for("fa") == "rtl"
    assert registry.direction_for("he") == "rtl"
    assert registry.direction_for("en") == "ltr"
    assert registry.direction_for("hi") == "ltr"  # Devanagari is LTR
    assert registry.direction_for("zh-Hans") == "ltr"
    assert registry.direction_for("sr-Cyrl") == "ltr"


def test_unknown_rtl_script_derives_direction_not_language(registry):
    # Pashto is not in the registry; its Arab script drives RTL.
    assert registry.direction_for("ps-Arab") == "rtl"
    # An LTR script on an unknown tag stays LTR.
    assert registry.direction_for("xx-Latn") == "ltr"


def test_region_is_separate_from_language(registry):
    assert registry.language_of("ur-PK") == "ur"
    assert registry.get("ur-PK").region == "PK"
    assert registry.get("ar-SA").region == "SA"


def test_parse_tag_decomposition():
    assert parse_tag("ur-PK") == {"language": "ur", "script": None, "region": "PK"}
    assert parse_tag("zh-Hant-TW") == {
        "language": "zh",
        "script": "Hant",
        "region": "TW",
    }


# ── Capability honesty ────────────────────────────────────────────────────────


def test_transcription_english_only(registry):
    # ADR-014: source ASR is whisper-tiny.en (English-only).
    for entry in registry.locales():
        if entry.language == "en":
            assert entry.transcription is True, entry.id
        else:
            assert entry.transcription is False, entry.id


def test_speech_requires_configured_voice(registry):
    for entry in registry.locales():
        if entry.speech:
            assert entry.voice_id, f"{entry.id} claims speech but has no voice"
    assert registry.supports_speech("ar") is True
    assert registry.supports_speech("ur") is True
    assert registry.supports_speech("he") is False  # no configured Hebrew voice


def test_ui_only_for_bundled_locales(registry):
    for entry in registry.locales():
        if entry.ui:
            # UI locales must resolve to a message bundle (directly or fallback).
            assert entry.message_bundle or entry.fallback, entry.id
    assert registry.supports_ui("fa") is False
    assert registry.supports_ui("ar") is True


def test_translation_available_for_all_registered_languages(registry):
    for entry in registry.locales():
        assert entry.translation is True, entry.id


def test_voice_id_resolves_through_fallback(registry):
    assert registry.voice_id_for("ar-SA") == "ar-XA-Neural2-A"
    assert registry.voice_id_for("ur-PK") == "ur-IN-Neural2-A"


# ── Registry integrity / single source of truth ───────────────────────────────


def test_registry_has_default_locale(registry):
    assert registry.get(registry.default_locale) is not None


def test_registry_has_no_duplicate_ids(registry):
    ids = [e.id for e in registry.locales()]
    assert len(ids) == len(set(ids))


def test_duplicate_or_invalid_ids_rejected():
    with pytest.raises(ValueError):
        LocaleRegistry([{"id": "en"}, {"id": "en"}], default_locale="en")
    with pytest.raises(ValueError):
        LocaleRegistry([{"id": "bad_tag!"}], default_locale="en")


def test_missing_default_locale_rejected():
    with pytest.raises(ValueError):
        LocaleRegistry([{"id": "en"}], default_locale="fr")


def test_as_payload_shape(registry):
    payload = registry.as_payload()
    assert payload["schemaVersion"] == 1
    assert payload["defaultLocale"] == "en"
    first = payload["locales"][0]
    for key in (
        "id",
        "language",
        "script",
        "region",
        "direction",
        "displayName",
        "nativeName",
        "enabled",
        "ui",
        "input",
        "speech",
        "transcription",
        "translation",
        "captions",
        "output",
        "voiceId",
        "fallback",
    ):
        assert key in first, key


def test_canonical_json_loads():
    data = json.loads(LOCALES_PATH.read_text(encoding="utf-8"))
    assert data["defaultLocale"] == "en"
    assert len(data["locales"]) == 19
