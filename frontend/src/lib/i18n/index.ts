/**
 * Public i18n runtime — the single entry point for localization in the app.
 *
 * Replaces the previous minimal `lib/i18n.ts` (still re-exported there for
 * backward compatibility). Exposes:
 *   - locale resolution / direction (registry)
 *   - translation hooks (messages)
 *   - Intl formatting helpers (format)
 *   - document `<html lang>/<html dir>` synchronization
 */

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  canonicalizeTag,
  isValidBcp47,
} from "./core";
import {
  DEFAULT_LOCALE,
  directionFor,
  messageBundleFor,
  resolveLocale,
} from "./registry";
import {
  bundleVersion,
  ensureBundle,
  getBundle,
  subscribeBundle,
  translate,
  type TranslateFn,
} from "./messages";

export type Locale = string;
export type { TranslateFn };
export * from "./core";
export * from "./registry";
export * from "./format";
export * from "./errors";

const COOKIE_NAME = "NEXT_LOCALE";

// ── storage (client only) ────────────────────────────────────────────────────

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (match && match[1]) return decodeURIComponent(match[1]);
  return null;
}

/** Resolve the persisted UI locale to a canonical BCP 47 tag. */
export function getLocale(): string {
  const stored = readCookie();
  if (stored && isValidBcp47(stored)) return resolveLocale(stored).id;
  return DEFAULT_LOCALE;
}

export function getCookieLocale(): Locale {
  return getLocale();
}

/** Synchronize `<html lang>` and `<html dir>` (also used pre-reload). */
export function applyDocumentLocale(tag: string): void {
  if (typeof document === "undefined") return;
  const canon = isValidBcp47(tag) ? resolveLocale(tag).id : DEFAULT_LOCALE;
  document.documentElement.lang = canon;
  document.documentElement.dir = directionFor(canon);
}

/** Persist the UI locale and reload (server renders the new `<html dir/lang>`). */
export function setLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  const canon = isValidBcp47(locale) ? resolveLocale(locale).id : DEFAULT_LOCALE;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(canon)}; path=/; max-age=31536000; SameSite=Lax`;
  try {
    window.localStorage.setItem("qai_locale", canon);
  } catch {
    /* storage unavailable — cookie still applies */
  }
  applyDocumentLocale(canon);
  window.location.reload();
}

// ── hooks ────────────────────────────────────────────────────────────────────

/** Current persisted UI locale (canonical BCP 47). */
export function useLocale(): Locale {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    setLocaleState(getLocale());
  }, []);
  return locale;
}

/** Synchronize `<html lang>/<html dir>` whenever the UI locale changes. */
export function useDocumentLocale(): void {
  const locale = useLocale();
  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);
}

/** `t(key, vars)` translation function with deterministic fallback. */
export function useTranslations(): TranslateFn {
  const locale = useLocale();
  const code = messageBundleFor(locale);
  // Re-render when a lazy bundle finishes loading (translate() reads the live
  // bundle map at call time, so `t` itself only needs a stable per-locale identity).
  useSyncExternalStore(subscribeBundle, bundleVersion, bundleVersion);
  useEffect(() => {
    ensureBundle(code);
  }, [code]);
  return useCallback(
    (key: string, vars?: Record<string, unknown>) => translate(key, vars, locale),
    [locale],
  );
}

// ── non-hook accessors (backward compatible) ─────────────────────────────────

export function getTranslations(locale: Locale): TranslateFn {
  return (key: string, vars?: Record<string, unknown>) => translate(key, vars, locale);
}

/** The full static `en` bundle, exposed for tooling/tests. */
export const messages: Record<string, Record<string, unknown>> = {
  en: (getBundle("en") ?? {}) as Record<string, unknown>,
};

export { canonicalizeTag };
