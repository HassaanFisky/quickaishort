/**
 * Speech / media compute-plane routing for Studio.
 *
 * Not a second capability registry (ADR-007). Maps the ingest → chat →
 * preview → export loop onto compute that is already in this repo:
 * on-device workers, browser platform APIs, or existing Cloud Run / Gemini.
 *
 * UI copy is generic — never vendor-flex (Whisper / Google / Xenova).
 */

export type ComputePlane =
  | "on_device"
  | "browser_platform"
  | "free_tier_cloud"
  | "paid_metered";

export const SPEECH_COPY = {
  ingestTitle: "On-device transcription",
  ingestHint:
    "Speech stays on this device. First run may download a local model — no cloud speech bill.",
  ingestProgress: "On-device transcription…",
  chatVoiceLabel: "Browser voice",
  chatVoiceListening: "Listening…",
  chatVoiceUnsupported:
    "Browser voice isn’t available here. Type your edit instead.",
  chatVoiceDenied: "Mic permission denied",
  dubPreviewLabel: "Browser voice preview",
  dubPreviewHint:
    "Preview only — not the export soundtrack. Export voice needs cloud TTS after billing + key approval.",
  dubPreviewUnsupported:
    "Browser voice preview isn’t available in this browser.",
  dubPreviewEmpty: "Translate first, then preview.",
  dubCloudAudioLabel: "Dub preview",
  dubDegraded:
    "Subtitles ready. Export voice is off until cloud TTS is approved. Preview with browser voice — never a fake dub.",
} as const;

export type SpeechRole =
  | "ingest_transcription"
  | "chat_voice_input"
  | "dub_voice_preview"
  | "dub_export_voice";

export function planeForSpeech(role: SpeechRole): ComputePlane {
  switch (role) {
    case "ingest_transcription":
      return "on_device";
    case "chat_voice_input":
    case "dub_voice_preview":
      return "browser_platform";
    case "dub_export_voice":
      return "paid_metered";
  }
}

/** True when a degraded dub may use on-browser preview instead of silence. */
export function canOfferBrowserDubPreview(opts: {
  status: string;
  fallbackReason: string | null;
  captionCount: number;
  previewAudioUrl: string | null;
}): boolean {
  if (opts.previewAudioUrl) return false;
  if (opts.status !== "degraded") return false;
  if (!opts.fallbackReason) return false;
  return opts.captionCount > 0;
}
