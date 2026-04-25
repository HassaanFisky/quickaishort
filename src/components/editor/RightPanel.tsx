"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Scissors, Settings2, Palette, Download, Loader2, Rocket, Lock, AlertTriangle, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useExport } from "@/hooks/useExport";
import { usePreflight } from "@/hooks/usePreflight";
import { cn } from "@/lib/utils";
import Link from "next/link";
import React, { useState, useEffect, useCallback } from "react";
import type { PreflightResult, PersonaVote, Recommendation } from "@/types/preflight";

const QUALITY_OPTIONS = ["low", "medium", "high"] as const;
const FILTER_OPTIONS = ["None", "Urban", "Retro", "Cinematic"] as const;

export default function RightPanel() {
  const { sourceFile, selectedClipId, suggestions, captionsEnabled, setCaptionsEnabled } =
    useEditorStore();

  const { exportClip, isExporting, exportProgress } = useExport();
  const { isRunning: isPreflightRunning, result: preflightResult, error: preflightError, isPremiumGated, triggerPreflight, reset: resetPreflight } = usePreflight();

  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [activeFilter, setActiveFilter] = useState("None");

  const selectedClip = selectedClipId
    ? suggestions.find((c) => c.id === selectedClipId) ?? suggestions[0]
    : suggestions[0];

  const clipDuration = selectedClip
    ? Math.round(selectedClip.end - selectedClip.start)
    : 0;

  const handleExport = () => {
    exportClip({ quality, captionsEnabled });
  };

  const handleRunPreflight = useCallback(async () => {
    if (!selectedClip) return;
    const { sourceUrl, transcript } = useEditorStore.getState();
    const clipTranscript = transcript?.chunks
      .filter((c) => c.start >= selectedClip.start && c.end <= selectedClip.end)
      .map((c) => c.text)
      .join(" ") ?? "";

    await triggerPreflight(
      sourceUrl ?? "",
      [{ start_sec: selectedClip.start, end_sec: selectedClip.end, score: selectedClip.confidence, transcript: clipTranscript }],
      false, // TODO: wire to next-auth session isPremium
      "anonymous",
    );
  }, [selectedClip, triggerPreflight]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "P" && selectedClip && !isPreflightRunning) {
        handleRunPreflight();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedClip, isPreflightRunning, handleRunPreflight]);

  return (
    <div className="w-full flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
          Properties
        </span>
      </div>

      <div className="flex flex-col gap-6 overflow-y-auto no-scrollbar pb-10">
        {/* Source / Clip Info */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold text-foreground/80 truncate">
            {sourceFile?.name ?? (selectedClip ? `Clip ${selectedClip.id}` : "No source")}
          </p>
          {selectedClip && (
            <p className="text-[10px] text-muted-foreground">
              {selectedClip.start.toFixed(1)}s – {selectedClip.end.toFixed(1)}s
              &nbsp;·&nbsp;{clipDuration}s
            </p>
          )}
        </div>

        {/* Trim Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scissors className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-foreground/40">
                Trim
              </span>
            </div>
            {selectedClip && (
              <span className="text-[10px] font-black text-primary px-2 py-0.5 rounded-full bg-primary/10">
                ACTIVE
              </span>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-4">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-bold text-muted-foreground">
                {selectedClip
                  ? `${formatTime(selectedClip.start)} – ${formatTime(selectedClip.end)}`
                  : "0:00 – 0:00"}
              </span>
            </div>
            <div className="relative h-6 flex items-center">
              <div className="absolute inset-0 bg-primary/20 rounded-lg" />
              <div className="absolute left-0 w-1 h-full bg-primary rounded-l-lg" />
              <div className="absolute right-0 w-1 h-full bg-primary rounded-r-lg" />
              <div className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-xl border-2 border-primary" />
            </div>
          </div>
        </div>

        {/* Adjustments */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-foreground/40">
              Adjustments
            </span>
          </div>
          <div className="space-y-5">
            {(["Opacity", "Speed", "Volume"] as const).map((label) => (
              <div key={label} className="space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {label}
                </span>
                <Slider defaultValue={[label === "Speed" ? 1 : label === "Volume" ? 80 : 100]} max={100} step={1} className="py-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Quality */}
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-widest text-foreground/40">
            Export Quality
          </span>
          <div className="flex gap-2">
            {QUALITY_OPTIONS.map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={cn(
                  "flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all",
                  quality === q
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-white/3 border-white/5 text-muted-foreground hover:bg-white/5",
                )}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Captions Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-foreground/40 cursor-pointer">
            Captions
          </span>
          <button
            onClick={() => setCaptionsEnabled(!captionsEnabled)}
            className={cn(
              "relative w-10 h-5 rounded-full transition-colors duration-200",
              captionsEnabled ? "bg-primary" : "bg-white/10",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
                captionsEnabled && "translate-x-5",
              )}
            />
          </button>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-foreground/40">
                Filters
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {FILTER_OPTIONS.map((filter) => (
              <Button
                key={filter}
                variant="ghost"
                className={cn(
                  "w-full h-10 justify-start px-4 rounded-xl text-xs font-bold border border-white/5 hover:bg-white/5",
                  activeFilter === filter &&
                    "bg-white/5 border-primary/20 text-primary",
                )}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>

        {/* Export Button */}
        <div className="pt-4">
          <Button
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(33,150,243,0.3)] hover:shadow-[0_0_30px_rgba(33,150,243,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed gap-2"
            onClick={handleExport}
            disabled={isExporting || !selectedClip || !sourceFile}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {exportProgress > 0 ? `${exportProgress}%` : "Preparing…"}
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Short
              </>
            )}
          </Button>
          {!selectedClip && (
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Select a clip from the left panel to export
            </p>
          )}
        </div>

        {/* Pre-Flight Analysis Section */}
        {selectedClip && (
          <div className="pt-6 border-t border-white/5 space-y-4">
            {/* Section Header */}
            <div className="flex items-center gap-2">
              <Rocket className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-foreground/40">
                Pre-Flight
              </span>
              <span className="text-[9px] text-muted-foreground/40 ml-auto">Shift+P</span>
            </div>

            {/* Idle — show run button */}
            {!preflightResult && !isPreflightRunning && !isPremiumGated && (
              <Button
                className="w-full h-10 rounded-xl font-black text-[10px] uppercase tracking-widest text-white gap-2 transition-all hover:opacity-90"
                style={{ background: "linear-gradient(to right, #a855f7, #ec4899)" }}
                onClick={handleRunPreflight}
              >
                <Rocket className="w-3.5 h-3.5" />
                Run Pre-Flight Analysis
              </Button>
            )}

            {/* Loading */}
            {isPreflightRunning && (
              <div className="flex items-center justify-center gap-3 py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Consulting audience panel…</span>
              </div>
            )}

            {/* Premium gate overlay */}
            {isPremiumGated && !isPreflightRunning && (
              <div className="relative rounded-2xl overflow-hidden border border-white/5">
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3 p-4">
                  <Lock className="w-5 h-5 text-primary" />
                  <p className="text-[10px] text-center text-foreground/80 leading-relaxed">
                    Full 6-persona panel is a Pro feature.
                  </p>
                  <Link
                    href="/pricing"
                    className="text-[10px] font-black text-primary underline underline-offset-2"
                  >
                    Upgrade to Pro →
                  </Link>
                  <button
                    onClick={resetPreflight}
                    className="text-[9px] text-muted-foreground/50 mt-1"
                  >
                    dismiss
                  </button>
                </div>
                <div className="opacity-20 pointer-events-none p-4 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 rounded-xl bg-white/5" />
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {preflightResult && !isPreflightRunning && (
              <PreflightResultsPanel result={preflightResult} onReset={resetPreflight} />
            )}

            {/* Error */}
            {preflightError && !isPreflightRunning && (
              <p className="text-[10px] text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {preflightError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function viralScoreColor(score: number): React.CSSProperties {
  if (score >= 90) return { background: "linear-gradient(to right, #ec4899, #a855f7)" };
  if (score >= 71) return { color: "#a855f7" };
  if (score >= 41) return { color: "#f59e0b" };
  return { color: "#6b7280" };
}

function RecommendationBadge({ rec }: { rec: Recommendation }) {
  if (rec === "PUBLISH") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-[9px] font-black uppercase tracking-wider text-green-400">
        <CheckCircle className="w-2.5 h-2.5" /> PUBLISH
      </span>
    );
  }
  if (rec === "DISCARD") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-[9px] font-black uppercase tracking-wider text-red-400">
        <XCircle className="w-2.5 h-2.5" /> DISCARD
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider text-amber-400">
      <RefreshCw className="w-2.5 h-2.5" /> REFINE FIRST
    </span>
  );
}

function PersonaCard({ vote }: { vote: PersonaVote }) {
  const hookColor =
    vote.hook_verdict === "strong"
      ? "text-green-400"
      : vote.hook_verdict === "weak"
        ? "text-red-400"
        : "text-amber-400";

  return (
    <div className="p-3 rounded-xl bg-white/3 border border-white/5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-foreground/60">
          {vote.persona_id}
        </span>
        <span
          className="text-xs font-black"
          style={viralScoreColor(vote.predicted_retention_pct)}
        >
          {Math.round(vote.predicted_retention_pct)}%
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("text-[8px] font-bold uppercase", hookColor)}>
          {vote.hook_verdict}
        </span>
        {vote.drop_off_second !== null && (
          <span className="text-[8px] text-muted-foreground/50">
            drops @{vote.drop_off_second}s
          </span>
        )}
      </div>
      <p className="text-[8px] text-muted-foreground/60 leading-relaxed line-clamp-2">
        {vote.reasoning}
      </p>
    </div>
  );
}

function PreflightResultsPanel({
  result,
  onReset,
}: {
  result: PreflightResult;
  onReset: () => void;
}) {
  const scoreStyle = viralScoreColor(result.weighted_consensus_score);
  const isGradient = result.weighted_consensus_score >= 90;

  return (
    <div className="space-y-4">
      {/* Consensus score */}
      <div className="p-4 rounded-2xl bg-white/3 border border-white/5 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">
            Consensus Score
          </p>
          <span
            className={cn("text-4xl font-black", isGradient && "premium-gradient-text")}
            style={isGradient ? undefined : scoreStyle}
          >
            {Math.round(result.weighted_consensus_score)}
          </span>
          <span className="text-xs text-muted-foreground/50 ml-1">/ 100</span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <RecommendationBadge rec={result.recommendation} />
          {result.timed_out && (
            <span className="text-[8px] text-amber-400/70">timed out</span>
          )}
        </div>
      </div>

      {/* Persona grid */}
      {result.persona_votes.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {result.persona_votes.map((vote) => (
            <PersonaCard key={vote.persona_id} vote={vote} />
          ))}
        </div>
      )}

      {/* Before/after if refined */}
      {result.refined_clip && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-primary/70">
            Refinement Applied
          </p>
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
            <span>
              {result.clip_candidate.start_sec.toFixed(1)}s–{result.clip_candidate.end_sec.toFixed(1)}s
            </span>
            <span className="text-primary">→</span>
            <span className="text-foreground/80">
              {result.refined_clip.start_sec.toFixed(1)}s–{result.refined_clip.end_sec.toFixed(1)}s
            </span>
          </div>
        </div>
      )}

      {/* BigQuery insight */}
      {result.bigquery_insight ? (
        <p className="text-[9px] text-muted-foreground/60 leading-relaxed border-l-2 border-primary/30 pl-3">
          {result.bigquery_insight}
        </p>
      ) : (
        <p className="text-[9px] text-muted-foreground/40 leading-relaxed border-l-2 border-white/10 pl-3">
          Connect YouTube account for personalized insights.
        </p>
      )}

      {/* Re-run */}
      <button
        onClick={onReset}
        className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
      >
        ↺ Run again
      </button>
    </div>
  );
}
