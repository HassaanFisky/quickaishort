/**
 * Canonical locale/language model — pure, dependency-free, isomorphic core.
 *
 * Mirrors `fastapi/services/locale_registry.py` semantics exactly, so the
 * frontend and backend resolve the same tags to the same capabilities with the
 * same deterministic fallback. This file is imported by:
 *   - the app (client + server bundles),
 *   - Node tests via `node --experimental-strip-types` (hence: no imports,
 *     no non-erasable syntax).
 *
 * Conventions (BCP 47 / Unicode CLDR):
 *   - language ≠ script ≠ direction ≠ region. Direction is explicit metadata
 *     per locale; unknown tags derive direction from their ISO 15924 *script*
 *     only (never from the language name).
 *   - Deterministic fallback: `fr-CA` → `fr` → product default.
 */

export type Direction = "ltr" | "rtl";

export interface LocaleEntry {
  id: string;
  language: string;
  script: string | null;
  region: string | null;
  direction: string;
  displayName: string;
  nativeName: string;
  enabled: boolean;
  ui: boolean;
  input: boolean;
  speech: boolean;
  transcription: boolean;
  translation: boolean;
  captions: boolean;
  output: boolean;
  voiceId: string | null;
  fallback: string | null;
  messageBundle?: string | null;
}

export interface LocaleCapability extends LocaleEntry {
  id: string;
}

export const DEFAULT_LOCALE = "en";

// ── BCP 47 (RFC 5646) structural grammar ─────────────────────────────────────
const ALPHA = "[A-Za-z]";
const DIGIT = "[0-9]";
const ALNUM = "[A-Za-z0-9]";
const LANGUAGE = `(?:${ALPHA}{2,3}|${ALPHA}{4}|${ALPHA}{5,8})`;
const SCRIPT = `${ALPHA}{4}`;
const REGION = `(?:${ALPHA}{2}|${DIGIT}{3})`;
const VARIANT = `(?:${ALNUM}{5,8}|${DIGIT}${ALNUM}{3})`;
const EXTENSION = `(?:${DIGIT}|[A-WY-Za-wy-z])(?:-${ALNUM}{2,8})+`;
const PRIVATE_USE = `x(?:-${ALNUM}{1,8})+`;

const BCP47_RE = new RegExp(
  `^${LANGUAGE}(?:-${SCRIPT})?(?:-${REGION})?(?:-${VARIANT})*(?:-${EXTENSION})*(?:-${PRIVATE_USE})?$`,
);

// ISO 15924 scripts with intrinsic RTL direction (W3C / CLDR supplementary data).
export const RTL_SCRIPTS: ReadonlySet<string> = new Set([
  "Arab", "Hebr", "Thaa", "Nkoo", "Adlm", "Rohg", "Syrc", "Samr", "Mand", "Mend",
]);

export function isValidBcp47(tag: string): boolean {
  return typeof tag === "string" && tag.length > 0 && BCP47_RE.test(tag);
}

export function canonicalizeTag(tag: string): string | null {
  if (!isValidBcp47(tag)) return null;
  const parts = tag.split("-");
  const out: string[] = [parts[0].toLowerCase()];
  for (const part of parts.slice(1)) {
    if (part.length === 4 && /^[A-Za-z]+$/.test(part)) {
      out.push(part[0].toUpperCase() + part.slice(1).toLowerCase()); // script
    } else if (part.length === 2 && /^[A-Za-z]+$/.test(part)) {
      out.push(part.toUpperCase()); // region
    } else if (part.length === 3 && /^[0-9]+$/.test(part)) {
      out.push(part); // numeric region (UN M.49)
    } else {
      out.push(part.toLowerCase()); // variant / extension / singleton
    }
  }
  return out.join("-");
}

export interface ParsedTag {
  language: string;
  script: string | null;
  region: string | null;
}

export function parseTag(tag: string): ParsedTag | null {
  if (!isValidBcp47(tag)) return null;
  const parts = tag.split("-");
  let script: string | null = null;
  let region: string | null = null;
  for (const part of parts.slice(1)) {
    if (script === null && part.length === 4 && /^[A-Za-z]+$/.test(part)) {
      script = part[0].toUpperCase() + part.slice(1).toLowerCase();
    } else if (
      region === null &&
      ((part.length === 2 && /^[A-Za-z]+$/.test(part)) ||
        (part.length === 3 && /^[0-9]+$/.test(part)))
    ) {
      region = part.toUpperCase();
    }
  }
  return { language: parts[0].toLowerCase(), script, region };
}

/** The single deterministic fallback policy, shared with the backend. */
export function fallbackChain(
  tag: string | null | undefined,
  defaultLocale: string = DEFAULT_LOCALE,
): string[] {
  if (!tag) return [defaultLocale];
  const chain: string[] = [];
  const canon = canonicalizeTag(tag);
  if (canon) chain.push(canon);
  const parsed = canon ? parseTag(tag) : null;
  if (parsed && parsed.language && !chain.includes(parsed.language)) {
    chain.push(parsed.language);
  }
  if (!chain.includes(defaultLocale)) chain.push(defaultLocale);
  return chain;
}

export interface LocaleRegistry {
  defaultLocale: string;
  get(tag: string | null | undefined): LocaleCapability | null;
  resolve(tag: string | null | undefined): LocaleCapability;
  fallbackChain(tag: string | null | undefined): string[];
  directionFor(tag: string | null | undefined): Direction;
  scriptFor(tag: string | null | undefined): string | null;
  languageOf(tag: string | null | undefined): string | null;
  voiceIdFor(tag: string | null | undefined): string | null;
  messageBundleFor(tag: string | null | undefined): string;
  supports(tag: string | null | undefined, capability: string): boolean;
  locales(): LocaleCapability[];
  uiLocales(): LocaleCapability[];
}

export function createLocaleRegistry(
  entries: LocaleEntry[],
  defaultLocale: string = DEFAULT_LOCALE,
): LocaleRegistry {
  const byTag = new Map<string, LocaleCapability>();
  for (const raw of entries) {
    const canon = canonicalizeTag(raw.id);
    if (!canon) throw new Error(`invalid locale id: ${JSON.stringify(raw.id)}`);
    if (byTag.has(canon)) throw new Error(`duplicate locale id: ${canon}`);
    byTag.set(canon, {
      ...raw,
      id: canon,
      language: raw.language.toLowerCase(),
      script: raw.script ?? null,
      region: raw.region ?? null,
      direction: (raw.direction || "ltr").toLowerCase(),
      voiceId: raw.voiceId ?? null,
      fallback: raw.fallback ?? null,
      messageBundle: raw.messageBundle ?? null,
    });
  }
  if (!byTag.has(defaultLocale)) {
    throw new Error(`default locale ${JSON.stringify(defaultLocale)} missing`);
  }

  const get = (tag: string | null | undefined): LocaleCapability | null => {
    if (!tag) return null;
    const canon = canonicalizeTag(tag);
    return canon ? byTag.get(canon) ?? null : null;
  };

  const resolve = (tag: string | null | undefined): LocaleCapability => {
    if (!tag) return byTag.get(defaultLocale)!;
    const exact = get(tag);
    if (exact) return exact;
    for (const candidate of fallbackChain(tag, defaultLocale)) {
      const entry = get(candidate);
      if (entry) return entry;
    }
    return byTag.get(defaultLocale)!;
  };

  const messageBundleFor = (tag: string | null | undefined): string => {
    const entry = resolve(tag);
    if (entry.messageBundle) return entry.messageBundle;
    if (entry.fallback) return messageBundleFor(entry.fallback);
    return defaultLocale;
  };

  return {
    defaultLocale,
    get,
    resolve,
    fallbackChain: (tag) => fallbackChain(tag, defaultLocale),
    directionFor: (tag) => {
      const entry = get(tag);
      if (entry) return entry.direction as Direction;
      const parsed = tag ? parseTag(tag) : null;
      if (parsed && parsed.script && RTL_SCRIPTS.has(parsed.script)) return "rtl";
      return "ltr";
    },
    scriptFor: (tag) => {
      const entry = get(tag);
      if (entry) return entry.script;
      return tag ? parseTag(tag)?.script ?? null : null;
    },
    languageOf: (tag) => {
      const entry = get(tag);
      if (entry) return entry.language;
      return tag ? parseTag(tag)?.language ?? null : null;
    },
    voiceIdFor: (tag) => resolve(tag).voiceId,
    messageBundleFor,
    supports: (tag, capability) => {
      const entry = resolve(tag);
      return Boolean((entry as unknown as Record<string, unknown>)[capability]);
    },
    locales: () =>
      [...byTag.values()].filter((e) => e.enabled).sort((a, b) => (a.id < b.id ? -1 : 1)),
    uiLocales: () =>
      [...byTag.values()].filter((e) => e.enabled && e.ui).sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}
