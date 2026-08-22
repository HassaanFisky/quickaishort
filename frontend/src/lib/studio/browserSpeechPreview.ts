/**
 * Browser SpeechSynthesis preview for Dub (Web Speech API).
 * Zero founder-wallet spend. Not export audio. Not Cloud TTS.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
 */

import { SPEECH_COPY } from "./computePlane";

const DUB_LANG_BCP47: Record<string, string> = {
  es: "es-ES",
  fr: "fr-FR",
  hi: "hi-IN",
  pt: "pt-BR",
  de: "de-DE",
  ar: "ar-SA",
  ur: "ur-PK",
};

const MAX_UTTERANCE_CHARS = 400;

export type SpeechLine = { text: string };

export function isBrowserSpeechPreviewAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function bcp47ForDubLang(lang: string | null | undefined): string {
  if (!lang) return "en-US";
  return DUB_LANG_BCP47[lang] ?? lang;
}

function pickVoice(
  synth: SpeechSynthesis,
  lang: string,
): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (!voices.length) return null;
  const prefix = lang.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
    voices.find((v) => v.default) ??
    voices[0] ??
    null
  );
}

function waitForVoices(synth: SpeechSynthesis): Promise<void> {
  if (synth.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve();
    };
    synth.addEventListener("voiceschanged", done);
    window.setTimeout(done, 750);
  });
}

export type SpeakHandle = { stop: () => void };

export async function speakLines(
  lines: SpeechLine[],
  lang: string,
  handlers: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (message: string) => void;
  } = {},
): Promise<SpeakHandle> {
  const stop = () => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  };

  if (!isBrowserSpeechPreviewAvailable()) {
    handlers.onError?.(SPEECH_COPY.dubPreviewUnsupported);
    return { stop };
  }

  const texts = lines
    .map((l) => l.text.trim())
    .filter(Boolean)
    .map((t) =>
      t.length > MAX_UTTERANCE_CHARS
        ? `${t.slice(0, MAX_UTTERANCE_CHARS)}…`
        : t,
    );

  if (!texts.length) {
    handlers.onError?.(SPEECH_COPY.dubPreviewEmpty);
    return { stop };
  }

  const synth = window.speechSynthesis;
  synth.cancel();
  await waitForVoices(synth);

  const bcp47 = bcp47ForDubLang(lang);
  const voice = pickVoice(synth, bcp47);
  let index = 0;
  let started = false;
  let stopped = false;

  const speakNext = () => {
    if (stopped) return;
    if (index >= texts.length) {
      handlers.onEnd?.();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(texts[index]);
    index += 1;
    utterance.lang = bcp47;
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.onstart = () => {
      if (!started) {
        started = true;
        handlers.onStart?.();
      }
    };
    utterance.onend = () => speakNext();
    utterance.onerror = (ev) => {
      if (stopped || ev.error === "canceled" || ev.error === "interrupted") {
        return;
      }
      stopped = true;
      synth.cancel();
      handlers.onError?.(
        ev.error === "not-allowed"
          ? SPEECH_COPY.chatVoiceDenied
          : `Browser voice failed (${ev.error || "unknown"}).`,
      );
    };
    synth.speak(utterance);
  };

  speakNext();

  return {
    stop: () => {
      stopped = true;
      stop();
    },
  };
}
