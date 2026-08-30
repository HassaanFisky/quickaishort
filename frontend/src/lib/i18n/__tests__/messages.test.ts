/**
 * Node tests for message bundles + deterministic translation fallback.
 *
 * Covers: exact lookups, plural interpolation, unknown-locale → en fallback,
 * lazy bundle loading, and that every shipped locale exposes the same key set
 * as `en` (so no locale can silently fall back to raw keys).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  getBundle,
  hasBundle,
  loadBundle,
  translate,
} from "@/lib/i18n/messages";
import { messageBundleFor } from "@/lib/i18n/registry";

const ALL_BUNDLES = ["en", "es", "fr", "hi", "pt", "de", "ar", "ur", "he"];

test("en bundle is statically available", () => {
  assert.equal(hasBundle("en"), true);
  assert.equal(translate("common.loading", undefined, "en"), "Loading…");
});

test("dot-path lookup + interpolation", () => {
  assert.equal(translate("nav.features", undefined, "en"), "Features");
  assert.equal(translate("common.itemsCount", { count: 1 }, "en"), "1 item");
  assert.equal(translate("common.itemsCount", { count: 5 }, "en"), "5 items");
  assert.equal(translate("common.itemsCount", { count: 0 }, "en"), "0 items");
});

test("unknown locale deterministically falls back to en", () => {
  assert.equal(translate("common.retry", undefined, "zz-ZZ"), "Retry");
  assert.equal(messageBundleFor("zz-ZZ"), "en");
});

test("lazy bundles load and contain real translations", async () => {
  await loadBundle("es");
  await loadBundle("ar");
  assert.equal(hasBundle("es"), true);
  assert.equal(translate("nav.features", undefined, "es"), "Funciones");
  assert.equal(translate("common.loading", undefined, "ar"), "جارٍ التحميل…");
});

test("Arabic plural categories drive the right template", async () => {
  await loadBundle("ar");
  // ar itemsCount: zero/one/two/few/many/other (see frontend/src/i18n/ar.json).
  assert.equal(translate("common.itemsCount", { count: 0 }, "ar"), "0 عناصر");
  assert.equal(translate("common.itemsCount", { count: 1 }, "ar"), "عنصر واحد");
  assert.equal(translate("common.itemsCount", { count: 2 }, "ar"), "عنصران");
  assert.equal(translate("common.itemsCount", { count: 5 }, "ar"), "5 عناصر");
  assert.equal(translate("common.itemsCount", { count: 11 }, "ar"), "11 عنصرًا");
});

test("every shipped locale has the exact key set of en", async () => {
  const flatten = (obj: unknown, prefix = ""): Set<string> => {
    const out = new Set<string>();
    if (obj && typeof obj === "object") {
      const rec = obj as Record<string, unknown>;
      const isPlural = Object.keys(rec).every((k) =>
        ["zero", "one", "two", "few", "many", "other"].includes(k),
      );
      if (isPlural && Object.keys(rec).length > 0) {
        out.add(prefix);
        return out;
      }
      for (const [k, v] of Object.entries(rec)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") {
          for (const kk of flatten(v, p)) out.add(kk);
        } else {
          out.add(p);
        }
      }
    }
    return out;
  };

  const enKeys = flatten(getBundle("en"));
  assert.ok(enKeys.size > 100, `expected >100 en keys, got ${enKeys.size}`);

  for (const code of ALL_BUNDLES) {
    if (code === "en") continue;
    await loadBundle(code);
    const bundle = getBundle(code);
    assert.ok(bundle, `bundle ${code} failed to load`);
    const keys = flatten(bundle);
    const missing = [...enKeys].filter((k) => !keys.has(k));
    assert.deepEqual(missing, [], `${code} is missing keys`);
  }
});
