"use client";

import { useEffect, useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { useDubVideo } from "@/hooks/useDubVideo";
import {
  DUB_LANG_OPTIONS,
  isDubTerminal,
  type DubMode,
  type DubTargetLang,
} from "@/lib/studio/dubFsm";
import {
  bcp47ForDubLang,
  speakBrowserVoice,
  stopBrowserVoice,
} from "@/lib/voiceover/browserSpeech";
import { useEditorStore } from "@/stores/editorStore";
import { toast } from "sonner";

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

  useEffect(() => {
    return () => stopBrowserVoice();
  }, []);

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
          Source speech must be English (on-device transcription). Cloud voice
          is optional. If it is missing or spend-locked, you get translated
          subtitles plus a browser voice preview — never a silent fake dub.
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
              {dubJob.fallbackReason === "spend_lock"
                ? "Voice paused to protect spend — translated subtitles are ready. Preview uses browser speech."
                : "Voice unavailable — translated subtitles are ready. Preview uses browser speech."}
            </p>
          )}
          {dubJob.status === "degraded" && (
            <button
              type="button"
              className="text-12 font-semibold text-primary hover:underline"
              onClick={() => {
                const text = captions.map((c) => c.text).filter(Boolean).join(". ");
                const ok = speakBrowserVoice(text, bcp47ForDubLang(dubJob.targetLang || lang));
                if (ok) {
                  toast.message("Browser voice preview — not a cloud dub.");
                } else {
                  toast.error(
                    "Browser voice is not supported here. Translated subtitles stay on the timeline.",
                  );
                }
              }}
            >
              Preview with browser voice
            </button>
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
            onClick={() => void startDub({ targetLang: lang, mode })}
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
              onClick={clearDub}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-foreground/5"
            >
              Clear
            </button>
          )}
      </div>
    </div>
  );
}
