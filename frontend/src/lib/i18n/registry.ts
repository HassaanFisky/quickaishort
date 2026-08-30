/**
 * Canonical locale registry — the single frontend source of truth.
 *
 * Backed by `frontend/src/lib/generated/locales.v1.json`, a byte-identical
 * mirror of `fastapi/capabilities/locales.v1.json` (enforced by CI via
 * `check_registry_sync.py`). Isomorphic: safe to import in server components
 * (no DOM access here).
 */

import data from "@/lib/generated/locales.v1.json";
import {
  createLocaleRegistry,
  DEFAULT_LOCALE,
  type Direction,
  type LocaleCapability,
  type LocaleEntry,
  type LocaleRegistry,
} from "./core";

const raw = data as { schemaVersion: number; defaultLocale: string; locales: LocaleEntry[] };

export const localeRegistry: LocaleRegistry = createLocaleRegistry(
  raw.locales,
  raw.defaultLocale || DEFAULT_LOCALE,
);

export { DEFAULT_LOCALE };
export type { Direction, LocaleCapability, LocaleEntry, LocaleRegistry };

/** Resolve a possibly-unknown tag to a canonical capability entry. */
export function resolveLocale(tag: string | null | undefined): LocaleCapability {
  return localeRegistry.resolve(tag);
}

/** Text direction for a tag (explicit metadata, script-derived fallback). */
export function directionFor(tag: string | null | undefined): Direction {
  return localeRegistry.directionFor(tag);
}

/** True when a locale should be laid out right-to-left. */
export function isRtl(tag: string | null | undefined): boolean {
  return directionFor(tag) === "rtl";
}

/** Canonical message bundle code for a locale (e.g. "ar-SA" → "ar"). */
export function messageBundleFor(tag: string | null | undefined): string {
  return localeRegistry.messageBundleFor(tag);
}
