/**
 * Node tests for the pure, dependency-free locale core.
 *
 * Run with `node --experimental-strip-types --test` (no bundler, no aliases):
 * this file mirrors `fastapi/tests/test_locale_registry.py` so the frontend
 * and backend stay in parity for BCP 47, fallback, and script/direction.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LOCALE,
  RTL_SCRIPTS,
  canonicalizeTag,
  createLocaleRegistry,
  fallbackChain,
  isValidBcp47,
  parseTag,
  type LocaleEntry,
} from "../core";

// A faithful inline subset of fastapi/capabilities/locales.v1.json. Only the
// fields the core logic reads matter here; the registry is data, not code.
const FIXTURE: LocaleEntry[] = [
  {
    id: "en",
    language: "en",
    script: null,
    region: null,
    direction: "ltr",
    displayName: "English",
    nativeName: "English",
    enabled: true,
    ui: true,
    input: true,
    speech: true,
    transcription: true,
    translation: true,
    captions: true,
    output: true,
    voiceId: "en-US-Neural2-D",
    fallback: null,
    messageBundle: "en",
  },
  {
    id: "en-US",
    language: "en",
    script: null,
    region: "US",
    direction: "ltr",
    displayName: "English (US)",
    nativeName: "English (US)",
    enabled: true,
    ui: true,
    input: true,
    speech: true,
    transcription: true,
    translation: true,
    captions: true,
    output: true,
    voiceId: "en-US-Neural2-D",
    fallback: "en",
    messageBundle: "en",
  },
  {
    id: "fr",
    language: "fr",
    script: null,
    region: null,
    direction: "ltr",
    displayName: "French",
    nativeName: "Français",
    enabled: true,
    ui: true,
    input: true,
    speech: true,
    transcription: false,
    translation: true,
    captions: true,
    output: true,
    voiceId: "fr-FR-Neural2-A",
    fallback: null,
    messageBundle: "fr",
  },
  {
    id: "ar",
    language: "ar",
    script: "Arab",
    region: null,
    direction: "rtl",
    displayName: "Arabic",
    nativeName: "العربية",
    enabled: true,
    ui: true,
    input: true,
    speech: true,
    transcription: false,
    translation: true,
    captions: true,
    output: true,
    voiceId: "ar-XA-Wavenet-A",
    fallback: null,
    messageBundle: "ar",
  },
  {
    id: "ar-SA",
    language: "ar",
    script: "Arab",
    region: "SA",
    direction: "rtl",
    displayName: "Arabic (Saudi Arabia)",
    nativeName: "العربية (السعودية)",
    enabled: true,
    ui: true,
    input: true,
    speech: true,
    transcription: false,
    translation: true,
    captions: true,
    output: true,
    voiceId: "ar-SA-Wavenet-A",
    fallback: "ar",
    messageBundle: "ar",
  },
  {
    id: "ur-PK",
    language: "ur",
    script: "Arab",
    region: "PK",
    direction: "rtl",
    displayName: "Urdu (Pakistan)",
    nativeName: "اردو (پاکستان)",
    enabled: true,
    ui: true,
    input: true,
    speech: true,
    transcription: false,
    translation: true,
    captions: true,
    output: true,
    voiceId: "ur-PK-Standard-A",
    fallback: "ur",
    messageBundle: "ur",
  },
  {
    id: "he",
    language: "he",
    script: "Hebr",
    region: null,
    direction: "rtl",
    displayName: "Hebrew",
    nativeName: "עברית",
    enabled: true,
    ui: true,
    input: true,
    speech: false,
    transcription: false,
    translation: true,
    captions: true,
    output: true,
    voiceId: null,
    fallback: null,
    messageBundle: "he",
  },
];

test("BCP 47 validity accepts real-world tags", () => {
  for (const tag of [
    "en",
    "en-US",
    "fr-CA",
    "ar-SA",
    "zh-Hant-TW",
    "de-DE",
    "es-419",
    "sr-Latn-RS",
  ]) {
    assert.equal(isValidBcp47(tag), true, `expected ${tag} to be valid`);
  }
});

test("BCP 47 validity rejects malformed tags", () => {
  // Note: `english` is *structurally valid* RFC 5646 (5–8 letter language
  // subtag); it is valid-but-unknown, so it resolves to the default — not here.
  for (const tag of ["", "e", "en-", "-en", "en_US", "en--US", "123", "en_us_CA"]) {
    assert.equal(isValidBcp47(tag), false, `expected ${tag} to be invalid`);
  }
});

test("valid-but-unknown language tags resolve to the default locale", () => {
  const registry = createLocaleRegistry(FIXTURE, "en");
  assert.equal(isValidBcp47("english"), true); // structurally valid, not registered
  assert.equal(registry.resolve("english").id, "en");
});

test("canonicalizeTag normalizes case and preserves 4-letter script / 2-letter region", () => {
  assert.equal(canonicalizeTag("FR-ca"), "fr-CA");
  assert.equal(canonicalizeTag("EN-us"), "en-US");
  assert.equal(canonicalizeTag("zh-hant"), "zh-Hant");
  assert.equal(canonicalizeTag("ar-eg"), "ar-EG");
  assert.equal(canonicalizeTag("es-419"), "es-419"); // UN M.49 numeric region
  assert.equal(canonicalizeTag("sr-latn-rs"), "sr-Latn-RS");
  assert.equal(canonicalizeTag("not a tag"), null);
  assert.equal(canonicalizeTag(""), null);
});

test("parseTag splits language / script / region", () => {
  assert.deepEqual(parseTag("fr-CA"), { language: "fr", script: null, region: "CA" });
  assert.deepEqual(parseTag("zh-Hant-TW"), { language: "zh", script: "Hant", region: "TW" });
  assert.deepEqual(parseTag("en"), { language: "en", script: null, region: null });
  assert.equal(parseTag("_bad_"), null);
});

test("fallbackChain is deterministic: canonical → language → default", () => {
  assert.deepEqual(fallbackChain("fr-CA"), ["fr-CA", "fr", "en"]);
  assert.deepEqual(fallbackChain("fr"), ["fr", "en"]);
  assert.deepEqual(fallbackChain("en"), ["en"]);
  assert.deepEqual(fallbackChain("ar-SA"), ["ar-SA", "ar", "en"]);
  assert.deepEqual(fallbackChain(null), ["en"]);
  assert.deepEqual(fallbackChain(undefined, "en"), ["en"]);
});

test("registry resolves unknown tags to the default locale (migration default)", () => {
  const registry = createLocaleRegistry(FIXTURE, "en");
  assert.equal(registry.defaultLocale, "en");
  assert.equal(registry.resolve("xx-YY").id, "en"); // unknown → default
  assert.equal(registry.resolve(null).id, "en");
  assert.equal(registry.resolve("").id, "en");
  assert.equal(registry.get("xx-YY"), null);
});

test("registry resolves region variants through their language fallback", () => {
  const registry = createLocaleRegistry(FIXTURE, "en");
  // en-US is an exact entry.
  assert.equal(registry.resolve("en-US").id, "en-US");
  // fr-CA is not a registered entry → falls back to fr.
  assert.equal(registry.resolve("fr-CA").id, "fr");
  assert.equal(registry.resolve("fr-CA").language, "fr");
  // ur-PK exact entry (RTL).
  assert.equal(registry.resolve("ur-PK").id, "ur-PK");
});

test("direction comes from explicit metadata, script is the only fallback", () => {
  const registry = createLocaleRegistry(FIXTURE, "en");
  // Explicit RTL entries (registered, including region variant ar-SA).
  for (const tag of ["ar", "ar-SA", "ur-PK", "he"]) {
    assert.equal(registry.directionFor(tag), "rtl", `expected ${tag} rtl`);
  }
  // LTR entries.
  for (const tag of ["en", "en-US", "fr", "fr-CA"]) {
    assert.equal(registry.directionFor(tag), "ltr", `expected ${tag} ltr`);
  }
  // Unknown tag with an RTL *script* subtag → rtl (script-derived only).
  assert.equal(registry.directionFor("abc-Arab"), "rtl");
  // Unknown tag with a non-RTL script → ltr (never "language = RTL" assumptions).
  assert.equal(registry.directionFor("abc-Latn"), "ltr");
  assert.equal(registry.directionFor("zh-Hant-TW"), "ltr");
  // Unknown tag with NO script subtag carries no direction signal → ltr.
  assert.equal(registry.directionFor("ar-EG"), "ltr");
  assert.equal(registry.directionFor("zz"), "ltr");
});

test("RTL script table contains the intrinsic-RTL ISO 15924 scripts", () => {
  assert.equal(RTL_SCRIPTS.has("Arab"), true);
  assert.equal(RTL_SCRIPTS.has("Hebr"), true);
  assert.equal(RTL_SCRIPTS.has("Latn"), false);
});

test("capability flags are queryable and transcription is en-only", () => {
  const registry = createLocaleRegistry(FIXTURE, "en");
  assert.equal(registry.supports("en", "transcription"), true);
  assert.equal(registry.supports("fr", "transcription"), false);
  assert.equal(registry.supports("ar", "transcription"), false);
  assert.equal(registry.supports("fr", "translation"), true);
  assert.equal(registry.supports("he", "speech"), false); // no configured voice
  assert.equal(registry.supports("en", "speech"), true);
});

test("messageBundleFor maps region variants to their bundle code", () => {
  const registry = createLocaleRegistry(FIXTURE, "en");
  assert.equal(registry.messageBundleFor("en-US"), "en");
  assert.equal(registry.messageBundleFor("ur-PK"), "ur");
  assert.equal(registry.messageBundleFor("fr-CA"), "fr"); // via fallback fr
  assert.equal(registry.messageBundleFor("zz"), "en"); // unknown → default
});

test("voiceIdFor resolves through fallback, null when no voice", () => {
  const registry = createLocaleRegistry(FIXTURE, "en");
  assert.equal(registry.voiceIdFor("fr"), "fr-FR-Neural2-A");
  assert.equal(registry.voiceIdFor("he"), null);
  assert.equal(registry.voiceIdFor("ur-PK"), "ur-PK-Standard-A");
});

test("locales()/uiLocales() return only enabled entries, sorted", () => {
  const registry = createLocaleRegistry(FIXTURE, "en");
  const ids = registry.locales().map((e) => e.id);
  assert.equal(ids.includes("en"), true);
  assert.equal(ids.includes("ar"), true);
  assert.equal(registry.uiLocales().every((e) => e.enabled && e.ui), true);
  assert.equal(registry.locales().length, FIXTURE.length);
});

test("DEFAULT_LOCALE is en", () => {
  assert.equal(DEFAULT_LOCALE, "en");
});
