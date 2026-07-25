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
import { useEditorStore } from "@/stores/editorStore";

export function DubPanel() {
  const { dubJob, startDub, cancelDub, clearDub, stageLabel } = useDubVideo();
  const hasTranscript = useEditorStore((s) => !!s.transcript?.chunks?.length);
  const [lang, setLang] = useState<DubTargetLang>("es");
  const [mode, setMode] = useState<DubMode>("full_dub");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const busy = !isDubTerminal(dubJob.status) && dubJob.status !== "idle";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("qai:dub-intent");
      if (!raw) return;
      sessionStorage.removeItem("qai:dub-intent");
      const intent = JSON.parse(raw) as { targetLang?: DubTargetLang; mode?: DubMode };
      if (intent.targetLang) setLang(intent.targetLang);
      if (intent.mode) setMode(intent.mode);
      if (hasTranscript && !busy) {
        void startDub({
          targetLang: intent.targetLang ?? "es",
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
        <p className="text-xs text-amber-400/90 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          Transcribe the video first, then start Dub Video.
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Translate to
        </span>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={lang}
          disabled={busy}
          onChange={(e) => setLang(e.target.value as DubTargetLang)}
        >
          {DUB_LANG_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Output
        </span>
        {(
          [
            ["full_dub", "Full dub (voice + subtitles)"],
            ["voiceover_only", "Voice only"],
            ["captions_only", "Subtitles only"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-2 text-xs text-foreground/90"
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
      </div>

      <button
        type="button"
        className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Hide details" : "More details"}
      </button>
      {showAdvanced && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Source speech must be English (current transcription model). Voice uses
          Google Neural2. Failed voice falls back to translated subtitles with a
          clear notice — never a fake dub.
        </p>
      )}

      {(busy || dubJob.status !== "idle") && (
        <div className="rounded-lg border border-border bg-card/60 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {stageLabel}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {Math.round(dubJob.progress)}%
            </span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.max(2, dubJob.progress)}%` }}
            />
          </div>
          {dubJob.fallbackReason && (
            <p className="text-[11px] text-amber-300/90">
              Voice unavailable — showing translated subtitles.
            </p>
          )}
          {dubJob.error && (
            <p className="text-[11px] text-red-400">{dubJob.error}</p>
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
