/**
 * Backward-compatible re-export of the i18n runtime.
 *
 * Existing importers (`@/lib/i18n`) keep working; new code should import the
 * specific module it needs (e.g. `@/lib/i18n/registry`, `@/lib/i18n/format`).
 */

export * from "./i18n/index";
