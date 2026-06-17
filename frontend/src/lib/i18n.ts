"use client";

import { useState, useEffect } from "react";
import en from "../i18n/en.json";
import es from "../i18n/es.json";
import fr from "../i18n/fr.json";
import hi from "../i18n/hi.json";

export type Locale = "en" | "es" | "fr" | "hi";

export const messages: Record<Locale, any> = {
  en,
  es,
  fr,
  hi,
};

export function getCookieLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
  if (match) {
    const val = match[1] as Locale;
    if (messages[val]) return val;
  }
  return "en";
}

export function setLocale(locale: Locale) {
  if (typeof document !== "undefined") {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }
}

export function getTranslations(locale: Locale) {
  return (key: string) => {
    const keys = key.split(".");
    let current = messages[locale];
    let fallback = messages["en"];

    for (const k of keys) {
      if (current) current = current[k];
      if (fallback) fallback = fallback[k];
    }

    if (typeof current === "string") return current;
    if (typeof fallback === "string") return fallback;
    return key;
  };
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(getCookieLocale());
  }, []);

  return locale;
}

export function useTranslations() {
  const locale = useLocale();

  return (key: string) => {
    const keys = key.split(".");
    let current = messages[locale];
    let fallback = messages["en"];

    for (const k of keys) {
      if (current) current = current[k];
      if (fallback) fallback = fallback[k];
    }

    if (typeof current === "string") return current;
    if (typeof fallback === "string") return fallback;
    return key;
  };
}
