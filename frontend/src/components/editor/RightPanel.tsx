"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GlowButton } from "@/components/ui/GlowButton";
import {
  Scissors,
  Settings2,
  Palette,
  Download,
  Loader2,
  Rocket,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  BarChart3,
  Clock3,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useServerExport } from "@/hooks/useServerExport";
import { usePreflight } from "@/hooks/usePreflight";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils/formatTime";

import Link from "next/link";
import { useSession } from "next-auth/react";
import React, { useEffect, useCallback } from "react";
import { toast } from "sonner";
import type { PreflightResult, PersonaVote, Recommendation } from "@/types/preflight";
import { motion, AnimatePresence } from "framer-motion";

const QUALITY_OPTIONS = ["low", "medium", "high"] as const;
const FILTER_OPTIONS = ["None", "Urban", "Retro", "Cinematic"] as const;

export default function RightPanel() {
  const {
    sourceFile,
    selectedClipId,
    suggestions,
    captionsEnabled,
    setCaptionsEnabled,
    duration,
    updateClip,
    exportSettings,
    setExportSetting,
  } = useEditorStore();

  const { data: session } = useSession();
  const userId = session?.user?.id ?? "anonymous";

  const { exportClip, isExporting, exportProgress } = useServerExport({ userId });
  const {
    isRunning: isPreflightRunning,
    result: preflightResult,
    error: preflightError,
    isPremiumGated,
    triggerPreflight,
    reset: resetPreflight,
  } = usePreflight();

  // Mirror store values locally for UI responsiveness; keep store as source of truth
  const quality = exportSettings.quality;
  const activeFilter = exportSettings.filter;

  const selectedClip = selectedClipId
    ? suggestions.find((c) => c.id === selectedClipId) ?? suggestions[0]
    : suggestions[0];

  const clipDuration = selectedClip
    ? Math.round(selectedClip.end - selectedClip.start)
    : 0;

  const handleExport = () => {
    exportClip({ quality: exportSettings.quality, captionsEnabled });
  };

  const handleRunPreflight = useCallback(async () => {
    if (!selectedClip) return;
    const { sourceUrl, transcript } = useEditorStore.getState();
    const clipTranscript =
      transcript?.chunks
        .filter((c) => c.start >= selectedClip.start && c.end <= selectedClip.end)
        .map((c) => c.text)
        .join(" ") ?? "";

    await triggerPreflight(
      sourceUrl ?? "",
      [
        {
          start_sec: selectedClip.start,
          end_sec: selectedClip.end,
          score: selectedClip.confidence,
          transcript: clipTranscript,
        },
      ],
      false,
      userId,
    );
  }, [selectedClip, triggerPreflight, userId]);

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
    <div className="w-full h-full flex flex-col gap-6 animate-in fade-in slide-in-from-right-6 duration-1000 ease-fluid">
      {/* Header Inspector */}
      <div className="flex items-center justify-between border-b border-foreground/5 pb-4 px-1">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/90">
            Inspector
          </span>
        </div>
        <div className="w-2 h-2 rounded-full bg-primary/40 animate-pulse" />
      </div>

      <ScrollArea className="flex-1 -mr-4 pr-4 no-scrollbar pb-10">
        <div className="flex flex-col gap-8">
          {/* Active Clip Meta */}
          <div className="p-5 rounded-2xl depth-card glass-surface spring-hover relative overflow-hidden group border border-foreground/5">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
            <div className="relative z-10 flex flex-col gap-1">
              <h3 className="text-xs font-black text-foreground truncate tracking-tight uppercase">
                {sourceFile?.name ??
                  (selectedClip
                    ? `Clip ID-${selectedClip.id.slice(0, 4)}`
                    : "Selection Required")}
              </h3>
              {selectedClip && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/60">
                  <Clock3 className="w-3 h-3" />
                  <span>
                    {formatTime(selectedClip.start)} –{" "}
                    {formatTime(selectedClip.end)}
                  </span>
                  <span className="text-primary/40">•</span>
                  <span className="text-primary">{clipDuration}s Total</span>
                </div>
              )}
            </div>
          </div>

          {/* Precision Trim */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Precision Trim
                </span>
              </div>
              {selectedClip && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-black text-emerald-400 uppercase tracking-tighter">
                    Synchronized
                  </span>
                </div>
              )}
            </div>

            <div className="p-5 rounded-2xl bg-foreground/[0.02] border border-foreground/5 space-y-5 backdrop-blur-sm">
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-foreground tracking-widest tabular-nums">
                  {selectedClip ? formatTime(selectedClip.start) : "0:00"}
                </span>
                <span className="text-[10px] text-muted-foreground/40 font-medium">
                  {selectedClip ? `${Math.max(0, Math.round(selectedClip.end - selectedClip.start))}s` : "—"}
                </span>
                <span className="text-[11px] font-bold text-foreground tracking-widest tabular-nums">
                  {selectedClip ? formatTime(selectedClip.end) : "0:00"}
                </span>
              </div>
              {selectedClip ? (
                <Slider
                  value={[selectedClip.start, selectedClip.end]}
                  min={0}
                  max={duration > 0 ? duration : (selectedClip.end + 10)}
                  step={0.1}
                  onValueChange={([s, e]) =>
                    updateClip(selectedClip.id, { start: s, end: e })
                  }
                  className="py-2"
                />
              ) : (
                <div className="h-10 flex items-center px-2">
                  <div className="w-full h-2 bg-foreground/5 rounded-full" />
                </div>
              )}
            </div>
          </div>

          {/* Audio & Speed */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Audio & Speed
              </span>
            </div>
            <div className="space-y-6 px-1">
              {/* Audio Boost */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Audio Boost
                  </span>
                  <span className="text-[10px] font-bold text-primary tabular-nums">
                    {exportSettings.audioBoost}%
                  </span>
                </div>
                <Slider
                  value={[exportSettings.audioBoost]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => setExportSetting("audioBoost", v)}
                  className="py-1"
                />
              </div>

              {/* Playback Speed */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Playback Speed
                  </span>
                  <span className="text-[10px] font-bold text-primary tabular-nums">
                    {(exportSettings.playbackSpeed / 100).toFixed(1)}x
                  </span>
                </div>
                <Slider
                  value={[exportSettings.playbackSpeed]}
                  min={50}
                  max={200}
                  step={5}
                  onValueChange={([v]) => setExportSetting("playbackSpeed", v)}
                  className="py-1"
                />
              </div>

              {/* Background Noise */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Background Noise
                  </span>
                  <span className="text-[10px] font-bold text-primary tabular-nums">
                    {exportSettings.noiseSuppression}%
                  </span>
                </div>
                <Slider
                  value={[exportSettings.noiseSuppression]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => setExportSetting("noiseSuppression", v)}
                  className="py-1"
                />
              </div>
            </div>
          </div>

          {/* Export Quality */}
          <div className="space-y-4">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">
              Export Quality
            </span>
            <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg border border-border">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => setExportSetting("quality", q)}
                  className={cn(
                    "flex-1 h-10 rounded-md text-[10px] font-black uppercase tracking-widest transition-all duration-150",
                    quality === q
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Auto Subtitles Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/40 border border-border group">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-black uppercase tracking-widest text-foreground">
                Auto Subtitles
              </span>
              <span className="text-[9px] font-medium text-muted-foreground">
                Burned-in text for social
              </span>
            </div>
            <button
              onClick={() => setCaptionsEnabled(!captionsEnabled)}
              className={cn(
                "relative w-12 h-6 rounded-full transition-all duration-500 overflow-hidden",
                captionsEnabled
                  ? "bg-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)]"
                  : "bg-foreground/10",
              )}
            >
              <div
                className={cn(
                  "absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-lg transition-all duration-500",
                  captionsEnabled
                    ? "translate-x-6 scale-110"
                    : "scale-90 opacity-40",
                )}
              />
            </button>
          </div>

          {/* Visual Style */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Palette className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Visual Style
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {FILTER_OPTIONS.map((filter) => (
                <Button
                  key={filter}
                  variant="ghost"
                  className={cn(
                    "h-11 justify-center rounded-lg text-[10px] font-black tracking-widest border transition-all duration-150 uppercase",
                    activeFilter === filter
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                  onClick={() => setExportSetting("filter", filter as typeof activeFilter)}
                >
                  {filter}
                </Button>
              ))}
            </div>
          </div>

          {/* Save Your Short */}
          <div className="pt-4 pb-4">
            <button
              className={cn(
                "w-full h-12 rounded-lg relative overflow-hidden transition-all duration-150",
                isExporting || !selectedClip || !sourceFile
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:brightness-110",
              )}
              onClick={handleExport}
              disabled={isExporting || !selectedClip || !sourceFile}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/80 to-accent animate-gradient-x" />
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
              <div className="relative z-10 flex items-center justify-center gap-3">
                {isExporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span className="text-[11px] font-black text-white uppercase tracking-[0.25em]">
                      Rendering {exportProgress}%
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 text-white" />
                    <span className="text-[11px] font-black text-white uppercase tracking-[0.25em]">
                      Save Your Short
                    </span>
                  </>
                )}
              </div>
            </button>
            {!selectedClip && (
              <p className="text-[9px] font-bold text-muted-foreground/40 text-center mt-3 uppercase tracking-widest">
                Select a clip above to export
              </p>
            )}
          </div>

          {/* Audience Preview */}
          {selectedClip && (
            <div className="pt-8 border-t border-foreground/10 space-y-6">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Audience Preview
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-foreground/5 border border-foreground/10">
                  <span className="text-[9px] font-bold text-muted-foreground/60 tracking-tighter">
                    Shift+P
                  </span>
                </div>
              </div>

              {/* Idle State */}
              {!preflightResult && !isPreflightRunning && !isPremiumGated && (
                <div
                  className="p-8 rounded-lg bg-secondary/30 border border-dashed border-border flex flex-col items-center justify-center text-center gap-4 cursor-pointer hover:bg-secondary/50 transition-all duration-150"
                  onClick={handleRunPreflight}
                >
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform duration-500 shadow-2xl">
                    <Rocket className="w-7 h-7 text-primary fill-primary/20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-foreground uppercase tracking-widest">
                      Test with Audience
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium max-w-[200px]">
                      See how a test audience would respond to this clip
                    </p>
                  </div>
                  <GlowButton
                    variant="premium"
                    size="sm"
                    className="h-9 px-6 rounded-full text-[9px] uppercase font-black tracking-widest"
                  >
                    Test with Audience
                  </GlowButton>
                </div>
              )}

              {/* Premium Gated State */}
              {isPremiumGated && (
                <div className="p-6 rounded-lg bg-amber-500/5 border border-amber-500/20 flex flex-col items-center justify-center text-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-amber-400" strokeWidth={1.5} />
                  <p className="text-xs font-black text-amber-400 uppercase tracking-widest">
                    Pro Feature
                  </p>
                  <p className="text-[10px] text-muted-foreground font-medium max-w-[200px]">
                    Full 6-persona audience testing is available on the Pro plan.
                  </p>
                  <GlowButton variant="outline" size="sm" className="h-8 px-5 rounded-full text-[9px] font-black" asChild>
                    <Link href="/pricing">Upgrade</Link>
                  </GlowButton>
                </div>
              )}

              {/* Error State */}
              {preflightError && !isPreflightRunning && !isPremiumGated && (
                <div className="p-5 rounded-lg bg-red-500/5 border border-red-500/20 text-center space-y-2">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                    Something went wrong
                  </p>
                  <p className="text-[9px] text-muted-foreground">{preflightError}</p>
                  <button
                    onClick={resetPreflight}
                    className="text-[9px] font-black text-muted-foreground/60 hover:text-foreground transition-colors uppercase tracking-widest"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Loading State */}
              {isPreflightRunning && (
                <div className="p-10 rounded-lg bg-secondary/40 border border-border flex flex-col items-center justify-center gap-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                    <Loader2
                      className="w-10 h-10 animate-spin text-primary relative z-10"
                      strokeWidth={1}
                    />
                  </div>
                  <div className="space-y-2 text-center">
                    <p className="text-[11px] font-black text-foreground uppercase tracking-[0.25em] animate-pulse">
                      Asking Your Audience...
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      Checking who&apos;d watch this...
                    </p>
                  </div>
                </div>
              )}

              {/* Results State */}
              {preflightResult && !isPreflightRunning && (
                <PreflightResultsPanel
                  result={preflightResult}
                  onReset={resetPreflight}
                  selectedClipId={selectedClipId}
                  updateClip={updateClip}
                />
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}



function viralScoreColor(score: number): { color?: string; background?: string } {
  if (score >= 90) return { background: "linear-gradient(to right, #ec4899, #a855f7)" };
  if (score >= 71) return { color: "#a855f7" };
  if (score >= 41) return { color: "#f59e0b" };
  return { color: "#6b7280" };
}

function RecommendationBadge({ rec }: { rec: Recommendation }) {
  if (rec === "PUBLISH") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
        <CheckCircle className="w-3 h-3 fill-emerald-400/20" /> Ready to Post
      </span>
    );
  }
  if (rec === "DISCARD") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-[10px] font-black uppercase tracking-widest text-red-400">
        <XCircle className="w-3 h-3 fill-red-400/20" /> Skip This One
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest text-amber-400">
      <RefreshCw className="w-3 h-3" /> Needs a Tweak
    </span>
  );
}

function PersonaCard({ vote }: { vote: PersonaVote }) {
  const scoreStyle = viralScoreColor(vote.predicted_retention_pct);
  const isViral = vote.predicted_retention_pct >= 90;

  const hookColor =
    vote.hook_verdict === "strong"
      ? "text-emerald-400"
      : vote.hook_verdict === "weak"
        ? "text-red-400"
        : "text-amber-400";

  return (
    <div className="p-4 rounded-lg bg-secondary/40 border border-border space-y-3 transition-all hover:bg-secondary hover:-translate-y-0.5 hover:border-primary/40">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover/persona:text-foreground transition-colors">
          {vote.persona_id}
        </span>
        <span
          className={cn(
            "text-sm font-black",
            isViral && "bg-clip-text text-transparent",
          )}
          style={
            isViral
              ? { backgroundImage: scoreStyle.background }
              : { color: scoreStyle.color }
          }
        >
          {Math.round(vote.predicted_retention_pct)}%
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-[9px] font-black uppercase tracking-tighter",
              hookColor,
            )}
          >
            Hook: {vote.hook_verdict}
          </span>
          {vote.drop_off_second !== null && (
            <span className="text-[9px] font-bold text-muted-foreground/40">
              @{vote.drop_off_second}s
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed line-clamp-3 italic">
          &ldquo;{vote.reasoning}&rdquo;
        </p>
      </div>
    </div>
  );
}

function PreflightResultsPanel({
  result,
  onReset,
  selectedClipId,
  updateClip,
}: {
  result: PreflightResult;
  onReset: () => void;
  selectedClipId: string | null;
  updateClip: (id: string, updates: { start?: number; end?: number }) => void;
}) {
  const scoreStyle = viralScoreColor(result.weighted_consensus_score);
  const isViral = result.weighted_consensus_score >= 90;

  return (
    <div className="space-y-6">
      {/* Predicted Success Node */}
      <div className="p-6 rounded-lg bg-secondary/40 border border-border flex items-center justify-between relative overflow-hidden">
        {isViral && (
          <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
        )}
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-1">
            Predicted Success
          </p>
          <div className="flex items-end gap-1.5">
            <span
              className={cn(
                "text-5xl font-black tracking-tighter leading-none",
                isViral && "bg-clip-text text-transparent",
              )}
              style={
                isViral
                  ? { backgroundImage: scoreStyle.background }
                  : { color: scoreStyle.color }
              }
            >
              {Math.round(result.weighted_consensus_score)}
            </span>
            <span className="text-sm font-bold text-muted-foreground/40 pb-1">/100</span>
          </div>
        </div>
        <div className="relative z-10 flex flex-col items-end gap-3">
          <RecommendationBadge rec={result.recommendation} />
          {result.timed_out && (
            <span className="text-[9px] font-bold text-amber-500/50 uppercase tracking-widest">
              Async Timeout
            </span>
          )}
        </div>
      </div>

      {/* Audience Segments Grid */}
      {result.persona_votes.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5">
          {result.persona_votes.map((vote) => (
            <PersonaCard key={vote.persona_id} vote={vote} />
          ))}
        </div>
      )}

      {/* Smart Trim Suggestion */}
      {result.refined_clip && (
        <div className="p-5 rounded-lg bg-primary/5 border border-primary/20 space-y-3 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-20">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            Smart Trim Suggestion
          </p>
          <div className="flex items-center gap-3 text-[11px] font-black">
            <span className="text-muted-foreground/60">
              {result.clip_candidate.start_sec.toFixed(1)}s –{" "}
              {result.clip_candidate.end_sec.toFixed(1)}s
            </span>
            <span className="text-primary animate-pulse">→</span>
            <span className="text-foreground">
              {result.refined_clip.start_sec.toFixed(1)}s –{" "}
              {result.refined_clip.end_sec.toFixed(1)}s
            </span>
          </div>
          {selectedClipId && (
            <button
              onClick={() => {
                updateClip(selectedClipId, {
                  start: result.refined_clip!.start_sec,
                  end: result.refined_clip!.end_sec,
                });
                toast.success("Smart trim applied to clip.");
              }}
              className="w-full h-9 rounded-xl bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/20 transition-colors"
            >
              Apply Smart Trim
            </button>
          )}
        </div>
      )}

      {/* Trend Insight */}
      <div className="px-1">
        {result.bigquery_insight ? (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Trend Insight
            </p>
            <p className="text-[11px] text-muted-foreground font-medium leading-relaxed border-l-2 border-primary/40 pl-4">
              {result.bigquery_insight}
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground font-medium leading-relaxed border-l-2 border-foreground/10 pl-4 italic">
            Connect YouTube analytics for deeper audience-specific predictions.
          </p>
        )}
      </div>

      {/* Run Again */}
      <button
        onClick={onReset}
        className="w-full py-3 text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest hover:text-foreground transition-colors flex items-center justify-center gap-2"
      >
        <RefreshCw className="w-3 h-3" />
        Run Again
      </button>
    </div>
  );
}
