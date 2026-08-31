/**
 * Locale-aware formatting — thin, defensive wrappers over ECMAScript `Intl`.
 *
 * Never hand-format dates, numbers, currencies, units or plurals. Every helper
 * degrades safely to the product default locale when a tag is unknown, so a
 * caller can never crash on a bad locale.
 */

import { resolveLocale } from "./registry";

const DEFAULT_TAG = "en";

function safeLocale(tag?: string | null): string {
  return resolveLocale(tag).id;
}

function safeTimeZone(timeZone?: string | null): string | undefined {
  if (!timeZone) return undefined;
  try {
    // Validate the IANA time zone by constructing an Intl formatter; invalid
    // zones throw a RangeError which we degrade to the runtime default.
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

export function formatNumber(
  value: number,
  locale?: string | null,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(safeLocale(locale), options).format(value);
  } catch {
    return new Intl.NumberFormat(DEFAULT_TAG, options).format(value);
  }
}

export function formatInteger(value: number, locale?: string | null): string {
  return formatNumber(value, locale, { maximumFractionDigits: 0 });
}

export function formatPercent(value: number, locale?: string | null, digits = 0): string {
  return formatNumber(value, locale, {
    style: "percent",
    maximumFractionDigits: digits,
  });
}

export function formatCurrency(
  value: number,
  currency: string,
  locale?: string | null,
  timeZone?: string | null,
): string {
  try {
    return new Intl.NumberFormat(safeLocale(locale), {
      style: "currency",
      currency,
      ...(safeTimeZone(timeZone) ? { timeZone: safeTimeZone(timeZone)! } : {}),
    }).format(value);
  } catch {
    return new Intl.NumberFormat(DEFAULT_TAG, { style: "currency", currency }).format(value);
  }
}

export function formatDate(
  date: Date | number | string,
  locale?: string | null,
  options?: Intl.DateTimeFormatOptions,
  timeZone?: string | null,
): string {
  try {
    return new Intl.DateTimeFormat(safeLocale(locale), {
      ...options,
      ...(safeTimeZone(timeZone) ? { timeZone: safeTimeZone(timeZone)! } : {}),
    }).format(new Date(date));
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_TAG, options).format(new Date(date));
  }
}

export function formatDateTime(
  date: Date | number | string,
  locale?: string | null,
  timeZone?: string | null,
): string {
  return formatDate(
    date,
    locale,
    { dateStyle: "medium", timeStyle: "short" },
    timeZone,
  );
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale?: string | null,
): string {
  try {
    return new Intl.RelativeTimeFormat(safeLocale(locale), { numeric: "auto" }).format(
      value,
      unit,
    );
  } catch {
    return new Intl.RelativeTimeFormat(DEFAULT_TAG, { numeric: "auto" }).format(value, unit);
  }
}

export function formatList(
  items: string[],
  locale?: string | null,
  type: Intl.ListFormatType = "conjunction",
): string {
  try {
    return new Intl.ListFormat(safeLocale(locale), { type }).format(items);
  } catch {
    return items.join(", ");
  }
}

/**
 * Human-readable video duration (e.g. "3:42" or "1:02:05"), formatted with the
 * locale's digits/grouping. `Intl` has no duration formatter, so we format the
 * numeric parts with Intl and join with ":" (the platform standard separator).
 */
export function formatDuration(totalSeconds: number, locale?: string | null): string {
  const tag = safeLocale(locale);
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const n = (v: number) => formatInteger(v, tag);
  const two = (v: number) => n(v).padStart(2, "0");
  return hours > 0 ? `${n(hours)}:${two(minutes)}:${two(seconds)}` : `${n(minutes)}:${two(seconds)}`;
}

export type PluralForms = string | { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };

/**
 * Locale-correct pluralization via Intl.PluralRules. Pass `count` (or `n`) in
 * `vars` and a message value of shape `{ one, other, few, many, zero, two }`.
 */
export function selectPluralForm(forms: PluralForms, count: number, locale?: string | null): string {
  if (typeof forms === "string") return forms;
  const tag = safeLocale(locale);
  let category: string;
  try {
    category = new Intl.PluralRules(tag).select(count);
  } catch {
    category = new Intl.PluralRules(DEFAULT_TAG).select(count);
  }
  const chosen = (forms as Record<string, string | undefined>)[category];
  return chosen ?? forms.other;
}
