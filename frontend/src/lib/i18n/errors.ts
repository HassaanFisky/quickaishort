/**
 * Error presentation — stable machine-readable codes, localized human text.
 *
 * Backend errors stay language-neutral (stable `code`/`kind` identifiers);
 * clients map them to localized messages. This helper keeps that mapping in
 * one place so error presentation never leaks into business logic.
 */

import type { TranslateFn } from "./messages";

export interface LocalizedError {
  code: string;
  message: string;
}

/**
 * Resolve a machine-readable error code to a localized message.
 * Falls back to `fallback` (an English technical description), never to a raw
 * translation key.
 */
export function localizeErrorCode(
  code: string,
  t: TranslateFn,
  fallback?: string,
): string {
  const key = `errors.${code}`;
  const message = t(key);
  if (message !== key) return message;
  return fallback ?? code;
}

/**
 * Map a backend error object (stable code + optional detail) into a localized
 * presentation while preserving the machine-readable code for analytics.
 */
export function localizeError(
  error: { code?: string | null; kind?: string | null; message?: string | null },
  t: TranslateFn,
  fallback?: string,
): LocalizedError {
  const code = error.code || error.kind || "generic";
  return {
    code,
    message: localizeErrorCode(code, t, fallback ?? error.message ?? undefined),
  };
}
