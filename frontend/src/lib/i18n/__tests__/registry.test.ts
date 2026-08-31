/**
 * Node tests for the real frontend locale registry (backed by the generated
 * `locales.v1.json`, a byte-identical mirror of the backend registry).
 *
 * Run via `npm run test:i18n` (uses scripts/node-i18n-loader.mjs to resolve
 * the `@/` alias and JSON imports outside of Next).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { canonicalizeTag, isValidBcp47 } from "@/lib/i18n/core";
import {
  DEFAULT_LOCALE,
  directionFor,
  isRtl,
  localeRegistry,
  messageBundleFor,
  resolveLocale,
} from "@/lib/i18n/registry";

test("registry is backed by the synced data and defaults to en", () => {
  assert.equal(localeRegistry.defaultLocale, DEFAULT_LOCALE);
  assert.equal(DEFAULT_LOCALE, "en");
});

test("every registered locale has a valid, canonical BCP 47 id", () => {
  const entries = localeRegistry.locales();
  assert.ok(entries.length >= 10, `expected a populated registry, got ${entries.length}`);
  for (const entry of entries) {
    assert.equal(isValidBcp47(entry.id), true, `invalid id: ${entry.id}`);
    // Ids are already canonical (canonicalization is idempotent).
    assert.equal(canonicalizeTag(entry.id), entry.id, entry.id);
  }
});

test("resolveLocale canonicalizes and falls back deterministically", () => {
  assert.equal(resolveLocale("ur").id, "ur");
  assert.equal(resolveLocale("FR-ca").id, "fr"); // unknown region → language
  assert.equal(resolveLocale("zz-ZZ").id, "en"); // unknown → default
  assert.equal(resolveLocale(undefined).id, "en");
});

test("directionFor: EN/ES/FR LTR; ur/ar/he/fa RTL", () => {
  for (const tag of ["en", "en-US", "es", "fr", "hi", "pt", "de"]) {
    assert.equal(directionFor(tag), "ltr", `expected ${tag} ltr`);
  }
  for (const tag of ["ur", "ur-PK", "ar", "ar-SA", "he", "fa"]) {
    assert.equal(directionFor(tag), "rtl", `expected ${tag} rtl`);
  }
});

test("isRtl is the boolean form of directionFor", () => {
  assert.equal(isRtl("ar"), true);
  assert.equal(isRtl("he"), true);
  assert.equal(isRtl("en"), false);
  assert.equal(isRtl("zz"), false);
});

test("messageBundleFor maps variants to base-language bundles", () => {
  assert.equal(messageBundleFor("ar-SA"), "ar");
  assert.equal(messageBundleFor("ur-PK"), "ur");
  assert.equal(messageBundleFor("en-US"), "en");
  assert.equal(messageBundleFor("zz"), "en");
});

test("RTL locales are exposed in the UI list", () => {
  const ui = localeRegistry.uiLocales().map((e) => e.id);
  for (const rtl of ["ar", "ur", "he"]) {
    assert.equal(ui.includes(rtl), true, `expected ${rtl} in UI locales`);
  }
  assert.equal(ui.includes("en"), true);
});

test("capability flags: transcription en-only, translation broad, speech per voice", () => {
  assert.equal(localeRegistry.supports("en", "transcription"), true);
  assert.equal(localeRegistry.supports("fr", "transcription"), false);
  assert.equal(localeRegistry.supports("ur", "transcription"), false);
  assert.equal(localeRegistry.supports("fr", "translation"), true);
  assert.equal(localeRegistry.supports("ar", "translation"), true);
});
