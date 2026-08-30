/**
 * Localized message resources.
 *
 * The default bundle (`en`) is statically imported (always available, no
 * network); every other bundle is lazy-loaded on first use and cached, so a
 * client never pays for all locales in its initial bundle.
 *
 * Missing keys fall back through the canonical chain (locale → language →
 * en) inside `translate()`. A key absent from *every* bundle (a developer
 * mistake) returns the raw key and logs a warning outside production.
 */

import en from "@/i18n/en.json";
import { messageBundleFor } from "./registry";
import { selectPluralForm, type PluralForms } from "./format";

type Bundle = Record<string, unknown>;
type BundleModule = { default?: Bundle } | Bundle;

const bundles: Record<string, Bundle> = { en: en as Bundle };
const listeners = new Set<() => void>();
const pending: Partial<Record<string, Promise<void>>> = {};
let version = 0;

const importers: Record<string, () => Promise<BundleModule>> = {
  es: () => import("@/i18n/es.json"),
  fr: () => import("@/i18n/fr.json"),
  hi: () => import("@/i18n/hi.json"),
  pt: () => import("@/i18n/pt.json"),
  de: () => import("@/i18n/de.json"),
  ar: () => import("@/i18n/ar.json"),
  ur: () => import("@/i18n/ur.json"),
  he: () => import("@/i18n/he.json"),
};

export function subscribeBundle(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function bundleVersion(): number {
  return version;
}

export function hasBundle(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(bundles, code);
}

export function getBundle(code: string): Bundle | undefined {
  return bundles[code];
}

/** Load a bundle for `code` if not already loaded/cached. Idempotent. */
export function loadBundle(code: string): Promise<void> {
  if (code === "en" || hasBundle(code)) return Promise.resolve();
  const importer = importers[code];
  if (!importer) return Promise.resolve(); // unknown code → en fallback covers it
  if (pending[code]) return pending[code];
  const promise = importer()
    .then((mod) => {
      const data = (mod as BundleModule).default ?? (mod as Bundle);
      bundles[code] = data as Bundle;
      version += 1;
      for (const listener of listeners) listener();
    })
    .catch(() => {
      // A failed lazy load stays on the en fallback — never a crash, and the
      // load can be retried next render.
    })
    .finally(() => {
      delete pending[code];
    });
  pending[code] = promise;
  return promise;
}

/** Fire-and-forget bundle load (for hooks). Idempotent. */
export function ensureBundle(code: string): void {
  void loadBundle(code);
}

function lookup(bundle: Bundle, keys: string[]): unknown {
  let current: unknown = bundle;
  for (const key of keys) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Bundle)[key];
  }
  return current;
}

function interpolate(template: string, vars: Record<string, unknown> | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * Resolve `key` (dot path) for `locale`, with deterministic fallback to `en`.
 * Returns the translated, interpolated string. Plural objects use
 * Intl.PluralRules via the `count`/`n` var.
 */
export function translate(
  key: string,
  vars?: Record<string, unknown>,
  locale?: string | null,
): string {
  const keys = key.split(".");
  const code = messageBundleFor(locale);
  const bundle = getBundle(code);
  const value = (bundle && lookup(bundle, keys)) ?? lookup(en as Bundle, keys);

  if (value === undefined) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing translation key: ${key}`);
    }
    return key;
  }

  if (typeof value === "string") return interpolate(value, vars);

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const count = Number(vars && (vars.count ?? vars.n));
    const forms = value as PluralForms;
    const chosen = Number.isFinite(count)
      ? selectPluralForm(forms, count, locale)
      : (typeof forms === "string" ? forms : forms.other);
    return interpolate(chosen ?? key, vars);
  }

  return key;
}

export type TranslateFn = (key: string, vars?: Record<string, unknown>) => string;
