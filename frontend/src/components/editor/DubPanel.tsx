"use client";

import { useEffect, useMemo, useState } from "react";
import { Languages, Loader2, Square, Volume2 } from "lucide-react";
import { useBrowserSpeechPreview } from "@/hooks/useBrowserSpeechPreview";
import { useDubVideo } from "@/hooks/useDubVideo";
import {
  canOfferBrowserDubPreview,
  SPEECH_COPY,
} from "@/lib/studio/computePlane";
import {
  DUB_LANG_OPTIONS,
  isDubTerminal,
  type DubMode,
  type DubTargetLang,
} from "@/lib/studio/dubFsm";
import { useEditorStore } from "@/stores/editorStore";

function readLastDubLang(): DubTargetLang {
  if (typeof window === "undefined") return "es";
  const saved = window.localStorage.getItem("qai:dub-last-lang");
  if (saved && DUB_LANG_OPTIONS.some((o) => o.code === saved)) {
    return saved as DubTargetLang;
  }
  return "es";
}

export function DubPanel() {
  const { dubJob, startDub, cancelDub, clearDub, stageLabel } = useDubVideo();
  const hasTranscript = useEditorStore((s) => !!s.transcript?.chunks?.length);
  const captions = useEditorStore((s) => s.captions);
  const [lang, setLang] = useState<DubTargetLang>(readLastDubLang);
  const [mode, setMode] = useState<DubMode>("full_dub");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const busy = !isDubTerminal(dubJob.status) && dubJob.status !== "idle";
  const speech = useBrowserSpeechPreview();
  const previewLang = (dubJob.targetLang as DubTargetLang | null) ?? lang;
  const speechLines = useMemo(
    () => captions.map((c) => ({ text: c.text })),
    [captions],
  );
  const offerBrowserPreview = canOfferBrowserDubPreview({
    status: dubJob.status,
    fallbackReason: dubJob.fallbackReason,
    captionCount: captions.length,
    previewAudioUrl: dubJob.previewAudioUrl,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("qai:dub-last-lang", lang);
    } catch {
      /* private mode */
    }
  }, [lang]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("qai:dub-intent");
      if (!raw) return;
      sessionStorage.removeItem("qai:dub-intent");
      const intent = JSON.parse(raw) as { targetLang?: DubTargetLang; mode?: DubMode };
      const targetLang = intent.targetLang ?? readLastDubLang();
      if (intent.targetLang) setLang(intent.targetLang);
      if (intent.mode) setMode(intent.mode);
      if (hasTranscript && !busy) {
        void startDub({
          targetLang,
          mode: intent.mode ?? "full_dub",
        });
      }
    } catch {
      // ignore bad intent
    }
    // Only on mount / when panel opens with pending intent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTranscript]);

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-lg bg-primary/15 p-2 text-primary">
          <Languages className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Dub Video</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Translate speech, generate a new voice track, and sync subtitles.
          </p>
        </div>
      </div>

      {!hasTranscript && (
        <p
          role="status"
          className="text-12 text-amber-400/90 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
        >
          Transcribe the video first, then start Dub Video.
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-12 font-bold uppercase tracking-widest text-muted-foreground">
          Translate to
        </span>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          value={lang}
          disabled={busy}
          aria-label="Target language"
          onChange={(e) => setLang(e.target.value as DubTargetLang)}
        >
          {DUB_LANG_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2 border-0 p-0 m-0">
        <legend className="text-12 font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Output
        </legend>
        {(
          [
            ["full_dub", "Full dub (voice + subtitles)"],
            ["voiceover_only", "Voice only"],
            ["captions_only", "Subtitles only"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-2 text-12 text-foreground/90"
          >
            <input
              type="radio"
              name="dub-mode"
              checked={mode === value}
              disabled={busy}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className="text-12 font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? "Hide details" : "More details"}
      </button>
      {showAdvanced && (
        <p className="text-12 text-muted-foreground leading-relaxed">
          Source speech must be English (current on-device transcription).
          Export voice is cloud TTS only after billing + key approval. If voice
          is unavailable, translated subtitles stay — never a fake dub. You can
          still hear a browser voice preview.
        </p>
      )}

      {(busy || dubJob.status !== "idle") && (
        <div
          className="rounded-lg border border-border bg-card/60 px-3 py-2 space-y-1.5"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-12 font-medium text-foreground flex items-center gap-1.5">
              {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {stageLabel}
            </span>
            <span className="text-12 text-muted-foreground tabular-nums">
              {Math.round(dubJob.progress)}%
            </span>
          </div>
          <div
            className="h-1 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(dubJob.progress)}
            aria-label="Dub progress"
          >
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.max(2, dubJob.progress)}%` }}
            />
          </div>
          {dubJob.fallbackReason && (
            <p className="text-12 text-amber-300/90" role="alert">
              {SPEECH_COPY.dubDegraded}
            </p>
          )}
          {dubJob.previewAudioUrl && (
            <audio
              className="w-full mt-1"
              controls
              preload="none"
              src={dubJob.previewAudioUrl}
              aria-label={SPEECH_COPY.dubCloudAudioLabel}
            />
          )}
          {offerBrowserPreview && (
            <div className="pt-1 space-y-1.5">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-foreground/5 disabled:opacity-40"
                aria-pressed={speech.status === "playing"}
                aria-label={
                  speech.status === "playing"
                    ? "Stop browser voice preview"
                    : SPEECH_COPY.dubPreviewLabel
                }
                disabled={!speech.available && speech.status !== "playing"}
                onClick={() => {
                  if (speech.status === "playing") {
                    speech.stop();
                    return;
                  }
                  void speech.play(speechLines, previewLang);
                }}
              >
                {speech.status === "playing" ? (
                  <Square className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden />
                )}
                {speech.status === "playing"
                  ? "Stop preview"
                  : SPEECH_COPY.dubPreviewLabel}
              </button>
              <p className="text-12 text-muted-foreground leading-relaxed">
                {SPEECH_COPY.dubPreviewHint}
              </p>
              {speech.error && (
                <p className="text-12 text-red-400" role="alert">
                  {speech.error}
                </p>
              )}
            </div>
          )}
          {dubJob.error && (
            <p className="text-12 text-red-400" role="alert">
              {dubJob.error}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {busy ? (
          <button
            type="button"
            onClick={() => void cancelDub()}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-foreground/5"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            disabled={!hasTranscript}
            onClick={() => {
              speech.stop();
              void startDub({ targetLang: lang, mode });
            }}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {dubJob.status === "ready" || dubJob.status === "degraded"
              ? "Run again"
              : "Start Dub Video"}
          </button>
        )}
        {(dubJob.status === "ready" ||
          dubJob.status === "degraded" ||
          dubJob.status === "failed") && (
            <button
              type="button"
              onClick={() => {
                speech.stop();
                clearDub();
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-foreground/5"
            >
              Clear
            </button>
          )}
      </div>
    </div>
  );
}
