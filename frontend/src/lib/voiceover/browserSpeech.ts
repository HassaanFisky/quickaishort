/**
 * Free in-browser speech preview. Never billed; never a substitute for a
 * successful cloud voice export. Callers must tell the user which path ran.
 */

export function isBrowserSpeechAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

const LANG_BCP47: Record<string, string> = {
  es: "es-ES",
  fr: "fr-FR",
  hi: "hi-IN",
  pt: "pt-BR",
  de: "de-DE",
  ar: "ar-SA",
  ur: "ur-PK",
  en: "en-US",
};

export function bcp47ForDubLang(code: string | null | undefined): string {
  if (!code) return "en-US";
  return LANG_BCP47[code] ?? code;
}

export function speakBrowserVoice(text: string, lang?: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !isBrowserSpeechAvailable()) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed.slice(0, 4000));
  if (lang) utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopBrowserVoice(): void {
  if (!isBrowserSpeechAvailable()) return;
  window.speechSynthesis.cancel();
}
