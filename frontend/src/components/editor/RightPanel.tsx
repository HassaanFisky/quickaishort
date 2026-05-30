"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { GlowButton } from "@/components/ui/GlowButton";
import {
  Scissors,
  Palette,
  Download,
  Loader2,
  Rocket,
  CheckCircle,
  XCircle,
  RefreshCw,
  BarChart3,
  Clock3,
  Sparkles,
  Zap,
  ChevronDown,
} from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useServerExport } from "@/hooks/useServerExport";
import { usePreflight } from "@/hooks/usePreflight";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils/formatTime";
import { useSession } from "next-auth/react";
import React, { useEffect, useCallback, useState } from "react";
import { toast } from "sonner";
import type { PreflightResult, PersonaVote, Recommendation } from "@/types/preflight";
import { motion, AnimatePresence } from "framer-motion";
import { InlinePaywallCard } from "@/components/shared/InlinePaywallCard";
import { TimelineLoader } from "@/components/ui/TimelineLoader";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";

const QUALITY_OPTIONS = ["low", "medium", "high"] as const;
const FILTER_OPTIONS = ["None", "Urban", "Retro", "Cinematic"] as const;

type AccordionKey = "audio" | "visuals" | "export";

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------
function Toggle({
  enabled,
  onToggle,
  ariaLabel,
}: {
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={enabled}
      onClick={onToggle}
      className={cn(
        "relative w-10 h-5 rounded-full transition-colors duration-300",
        enabled ? "bg-violet-500" : "bg-white/10"
      )}
    >
      <div
        className={cn(
          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300",
          enabled ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Accordion section header
// ---------------------------------------------------------------------------
function AccordionHeader({
  label,
  isOpen,
  onToggle,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors rounded-xl"
    >
      <span className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
        {label}
      </span>
      <ChevronDown
        className={cn(
          "w-3.5 h-3.5 text-zinc-500 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main RightPanel
// ---------------------------------------------------------------------------
export default function RightPanel() {
  const {
    sourceFile,
    sourceUrl,
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
  const userId = session?.user?.id ?? "";

  const {
    exportClip,
    isExporting,
    exportProgress,
    exportDone,
    exportError,
    lastDownloadUrl,
    resetExportState,
  } = useServerExport({ userId });

  const {
    isRunning: isPreflightRunning,
    result: preflightResult,
    error: preflightError,
    isPremiumGated,
    triggerPreflight,
    reset: resetPreflight,
  } = usePreflight();

  const [openGroup, setOpenGroup] = useState<AccordionKey | null>("audio");

  const toggleGroup = (key: AccordionKey) =>
    setOpenGroup((prev) => (prev === key ? null : key));

  const quality = exportSettings.quality;
  const activeFilter = exportSettings.filter;

  const selectedClip = selectedClipId
    ? suggestions.find((c) => c.id === selectedClipId) ?? suggestions[0]
    : suggestions[0];

  const clipDuration = selectedClip
    ? Math.round(selectedClip.end - selectedClip.start)
    : 0;

  const hasVideo = !!(sourceFile || sourceUrl);
  const hasClip = !!selectedClip;
  const isZeroState = !hasVideo || !hasClip;

  const handleExport = () => {
    exportClip({ quality: exportSettings.quality, captionsEnabled });
  };

  const handleRunPreflight = useCallback(async () => {
    if (!userId || !selectedClip) return;
    const { sourceUrl: url, transcript } = useEditorStore.getState();
    const clipTranscript =
      transcript?.chunks
        .filter((c) => c.start >= selectedClip.start && c.end <= selectedClip.end)
        .map((c) => c.text)
        .join(" ") ?? "";
    await triggerPreflight(
      url ?? "",
      [
        {
          start_sec: selectedClip.start,
          end_sec: selectedClip.end,
          score: selectedClip.confidence,
          transcript: clipTranscript,
        },
      ],
      true,
      userId
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

  // ------------------------------------------------------------------
  // ZERO STATE
  // ------------------------------------------------------------------
  if (isZeroState) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="w-full rounded-2xl bg-zinc-900/40 border border-white/5 p-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/4 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-zinc-500" />
          </div>
          <p className="text-xs text-zinc-500 font-medium leading-relaxed max-w-[180px]">
            Select a clip or import a video to unlock properties
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // ACTIVE STATE — Accordion inspector
  // ------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-1 p-4 pb-6">
      {/* Clip meta */}
      <div className="px-1 pb-3 border-b border-white/5 mb-1">
        <h3 className="text-[11px] font-black text-zinc-100 truncate uppercase tracking-tight">
          {sourceFile?.name ??
            (selectedClip
              ? `Clip ${selectedClip.id.slice(0, 4).toUpperCase()}`
              : "Selection")}
        </h3>
        {selectedClip && (
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
            <Clock3 className="w-3 h-3" />
            <span>
              {formatTime(selectedClip.start)} – {formatTime(selectedClip.end)}
            </span>
            <span className="text-violet-400">{clipDuration}s</span>
          </div>
        )}
      </div>

      {/* ── Group 1: Basic & Audio ─────────────────────────────────── */}
      <div className="rounded-xl border border-white/5 overflow-hidden">
        <AccordionHeader
          label="Basic & Audio"
          isOpen={openGroup === "audio"}
          onToggle={() => toggleGroup("audio")}
        />
        <AnimatePresence initial={false}>
          {openGroup === "audio" && (
            <motion.div
              key="audio-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 flex flex-col gap-4 border-t border-white/5 pt-3">
                {/* Precision Trim */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Scissors className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                      Precision Trim
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-zinc-400 tabular-nums">
                    <span>{selectedClip ? formatTime(selectedClip.start) : "—"}</span>
                    <span className="text-zinc-600">
                      {selectedClip
                        ? `${Math.max(0, Math.round(selectedClip.end - selectedClip.start))}s`
                        : "—"}
                    </span>
                    <span>{selectedClip ? formatTime(selectedClip.end) : "—"}</span>
                  </div>
                  {selectedClip ? (
                    <Slider
                      value={[selectedClip.start, selectedClip.end]}
                      min={0}
                      max={duration > 0 ? duration : selectedClip.end + 10}
                      step={0.1}
                      onValueChange={([s, e]) =>
                        updateClip(selectedClip.id, { start: s, end: e })
                      }
                      className="py-1"
                    />
                  ) : (
                    <div className="h-8 flex items-center justify-center">
                      <span className="text-[9px] text-zinc-600 uppercase tracking-widest">
                        Select a clip to trim
                      </span>
                    </div>
                  )}
                </div>

                {/* Audio Boost */}
                <SliderRow
                  label="Audio Boost"
                  value={exportSettings.audioBoost}
                  display={`${exportSettings.audioBoost}%`}
                  min={0}
                  max={200}
                  step={1}
                  onChange={(v) => setExportSetting("audioBoost", v)}
                />

                {/* Playback Speed */}
                <SliderRow
                  label="Playback Speed"
                  value={exportSettings.playbackSpeed}
                  display={`${(exportSettings.playbackSpeed / 100).toFixed(1)}x`}
                  min={50}
                  max={200}
                  step={5}
                  onChange={(v) => setExportSetting("playbackSpeed", v)}
                />

                {/* Background Noise */}
                <SliderRow
                  label="Noise Reduction"
                  value={exportSettings.noiseSuppression}
                  display={`${exportSettings.noiseSuppression}%`}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(v) => setExportSetting("noiseSuppression", v)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Group 2: Captions & Visuals ───────────────────────────── */}
      <div className="rounded-xl border border-white/5 overflow-hidden">
        <AccordionHeader
          label="Captions & Visuals"
          isOpen={openGroup === "visuals"}
          onToggle={() => toggleGroup("visuals")}
        />
        <AnimatePresence initial={false}>
          {openGroup === "visuals" && (
            <motion.div
              key="visuals-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 flex flex-col gap-4 border-t border-white/5 pt-3">
                <ToggleRow
                  label="Auto Subtitles"
                  sub="Burned-in text for social"
                  enabled={captionsEnabled}
                  onToggle={() => setCaptionsEnabled(!captionsEnabled)}
                  ariaLabel={captionsEnabled ? "Disable Auto Subtitles" : "Enable Auto Subtitles"}
                />
                <ToggleRow
                  label="Smart Transitions"
                  sub="Fade & motion smoothing"
                  enabled={exportSettings.transitionEnabled}
                  onToggle={() =>
                    setExportSetting("transitionEnabled", !exportSettings.transitionEnabled)
                  }
                  ariaLabel={
                    exportSettings.transitionEnabled
                      ? "Disable Smart Transitions"
                      : "Enable Smart Transitions"
                  }
                />
                <ToggleRow
                  label="AI Voiceover"
                  sub="Synthetic narration"
                  enabled={exportSettings.voiceoverEnabled}
                  onToggle={() =>
                    setExportSetting("voiceoverEnabled", !exportSettings.voiceoverEnabled)
                  }
                  ariaLabel={
                    exportSettings.voiceoverEnabled
                      ? "Disable AI Voiceover"
                      : "Enable AI Voiceover"
                  }
                />

                {/* Visual Style */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                      Visual Style
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FILTER_OPTIONS.map((filter) => (
                      <Button
                        key={filter}
                        variant="ghost"
                        className={cn(
                          "h-9 justify-center rounded-lg text-[10px] font-black tracking-widest border transition-colors uppercase",
                          activeFilter === filter
                            ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                            : "bg-zinc-800 border-white/5 text-zinc-400 hover:text-zinc-100"
                        )}
                        onClick={() =>
                          setExportSetting("filter", filter as typeof activeFilter)
                        }
                      >
                        {filter}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Group 3: Export ───────────────────────────────────────── */}
      <div className="rounded-xl border border-white/5 overflow-hidden">
        <AccordionHeader
          label="Export"
          isOpen={openGroup === "export"}
          onToggle={() => toggleGroup("export")}
        />
        <AnimatePresence initial={false}>
          {openGroup === "export" && (
            <motion.div
              key="export-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 flex flex-col gap-4 border-t border-white/5 pt-3">
                {/* Quality */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Quality
                  </span>
                  <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg border border-white/5">
                    {QUALITY_OPTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => setExportSetting("quality", q)}
                        className={cn(
                          "flex-1 h-8 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors",
                          quality === q
                            ? "bg-violet-500 text-white"
                            : "text-zinc-400 hover:text-zinc-100"
                        )}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Aspect Ratio
                  </span>
                  <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg border border-white/5">
                    {(["9:16", "1:1"] as const).map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() => setExportSetting("aspectRatio", ratio)}
                        aria-pressed={exportSettings.aspectRatio === ratio}
                        className={cn(
                          "flex-1 h-8 rounded-md text-[10px] font-black tracking-widest transition-colors",
                          exportSettings.aspectRatio === ratio
                            ? "bg-violet-500 text-white"
                            : "text-zinc-400 hover:text-zinc-100"
                        )}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export button */}
                <AnimatePresence mode="wait">
                  {exportDone ? (
                    <motion.div
                      key="export-done"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex flex-col gap-2"
                    >
                      <button
                        onClick={() => {
                          if (lastDownloadUrl) {
                            const a = document.createElement("a");
                            a.href = lastDownloadUrl;
                            a.download = "quickai-short.mp4";
                            a.target = "_blank";
                            a.rel = "noopener";
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                          }
                        }}
                        className="w-full h-11 rounded-xl flex items-center justify-center gap-2"
                        style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                      >
                        <CheckCircle className="w-4 h-4 text-white" />
                        <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">
                          Download Ready
                        </span>
                      </button>
                      <button
                        onClick={() => resetExportState()}
                        className="w-full h-8 text-[9px] font-black text-zinc-500 hover:text-violet-400 uppercase tracking-widest transition-colors"
                      >
                        Export again
                      </button>
                    </motion.div>
                  ) : exportError ? (
                    <motion.div
                      key="export-error"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex flex-col gap-2"
                    >
                      <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/8">
                        <p className="text-[10px] font-bold text-red-400 text-center leading-relaxed">
                          {exportError}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          resetExportState();
                          handleExport();
                        }}
                        className="w-full h-11 rounded-xl bg-zinc-800 border border-white/5 flex items-center justify-center gap-2 text-zinc-100 hover:bg-zinc-700 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                          Retry Export
                        </span>
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="export-idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <button
                        className={cn(
                          "w-full h-11 rounded-xl relative overflow-hidden transition-colors",
                          isExporting || !selectedClip || (!sourceFile && !sourceUrl)
                            ? "opacity-40 cursor-not-allowed bg-zinc-800"
                            : "bg-violet-600 hover:bg-violet-500"
                        )}
                        onClick={handleExport}
                        disabled={
                          isExporting || !selectedClip || (!sourceFile && !sourceUrl)
                        }
                      >
                        <div className="flex items-center justify-center gap-2">
                          {isExporting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                              <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">
                                Rendering {exportProgress}%
                              </span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4 text-white" />
                              <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">
                                Save Your Short
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Pre-Flight — shown below accordion when clip is selected ── */}
      {hasClip && (
        <div className="mt-2 pt-4 border-t border-white/5 flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                Audience Preview
              </span>
            </div>
            <span className="text-[9px] font-bold text-zinc-600 tracking-tighter">
              Shift+P
            </span>
          </div>

          {!preflightResult && !isPreflightRunning && !isPremiumGated && (
            <div
              className="p-6 rounded-xl bg-zinc-800/50 border border-white/5 flex flex-col items-center gap-4 cursor-pointer hover:bg-zinc-800 transition-colors"
              onClick={handleRunPreflight}
            >
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-violet-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-xs font-black text-zinc-100 uppercase tracking-widest">
                  Test with Audience
                </p>
                <p className="text-[10px] text-zinc-500 max-w-[180px]">
                  See how a test audience would respond to this clip
                </p>
              </div>
              <GlowButton variant="premium" size="sm" className="h-8 px-5 rounded-full text-[9px] uppercase font-black tracking-widest">
                Run Pre-Flight
              </GlowButton>
            </div>
          )}

          {preflightError && !isPreflightRunning && !isPremiumGated && (
            <div className="p-5 rounded-xl bg-red-500/8 border border-red-500/20 flex flex-col items-center gap-3">
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest text-center">
                {preflightError}
              </p>
              <button
                onClick={handleRunPreflight}
                className="h-8 px-5 rounded-full bg-red-500/10 border border-red-500/20 text-[9px] font-black text-red-400 uppercase tracking-widest hover:bg-red-500/20 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {isPremiumGated && !isPreflightRunning && (
            <InlinePaywallCard
              feature="Audience Pre-Flight"
              body="Run multi-persona simulations on every clip before you publish. Pro unlocks all six audience personas, refined-clip suggestions, and trend grounding."
              ctaLabel="Upgrade to Pro"
              footnote="Your clip selection stays here while you decide."
            />
          )}

          {isPreflightRunning && (
            <div className="flex justify-center py-4">
              <TimelineLoader
                phases={["Analyzing...", "Simulating...", "Scoring...", "Grounding..."]}
              />
            </div>
          )}

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
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
          {label}
        </span>
        <span className="text-[10px] font-bold text-violet-400 tabular-nums">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="py-1"
      />
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  enabled,
  onToggle,
  ariaLabel,
}: {
  label: string;
  sub: string;
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-black uppercase tracking-widest text-zinc-100">
          {label}
        </span>
        <span className="text-[9px] font-medium text-zinc-500">{sub}</span>
      </div>
      <Toggle enabled={enabled} onToggle={onToggle} ariaLabel={ariaLabel} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-Flight results (logic unchanged)
// ---------------------------------------------------------------------------

function viralScoreColor(score: number): { color?: string; background?: string } {
  if (score >= 90) return { background: "linear-gradient(to right,#ec4899,#a855f7)" };
  if (score >= 71) return { color: "#a855f7" };
  if (score >= 41) return { color: "#f59e0b" };
  return { color: "#6b7280" };
}

function RecommendationBadge({ rec }: { rec: Recommendation }) {
  if (rec === "PUBLISH") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-400">
        <CheckCircle className="w-3 h-3" /> Ready to Post
      </span>
    );
  }
  if (rec === "DISCARD") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-black uppercase tracking-widest text-red-400">
        <XCircle className="w-3 h-3" /> Skip This One
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-400">
      <RefreshCw className="w-3 h-3" /> Needs a Tweak
    </span>
  );
}

const PERSONA_LABELS: Record<string, { name: string; emoji: string }> = {
  genz:          { name: "Gen Z",         emoji: "⚡" },
  millennial:    { name: "Millennial",    emoji: "💼" },
  sports:        { name: "Sports Fan",    emoji: "🏆" },
  tech:          { name: "Tech Nerd",     emoji: "🖥️" },
  entertainment: { name: "Entertainment", emoji: "🎬" },
  news:          { name: "News Reader",   emoji: "📰" },
};

function PersonaCard({ vote, index }: { vote: PersonaVote; index: number }) {
  const scoreStyle = viralScoreColor(vote.predicted_retention_pct);
  const isViral = vote.predicted_retention_pct >= 90;
  const label = PERSONA_LABELS[vote.persona_id] ?? { name: vote.persona_id, emoji: "👤" };
  const hookColor =
    vote.hook_verdict === "strong"
      ? "text-emerald-400"
      : vote.hook_verdict === "weak"
      ? "text-red-400"
      : "text-amber-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="p-3 rounded-xl bg-zinc-800 border border-white/5 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm leading-none">{label.emoji}</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-100">
            {label.name}
          </span>
          {vote.would_watch_full ? (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-black text-emerald-400 uppercase">
              Watches
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[8px] font-black text-red-400 uppercase">
              Scrolls
            </span>
          )}
        </div>
        <span
          className={cn("text-sm font-black tabular-nums", isViral && "bg-clip-text text-transparent")}
          style={isViral ? { backgroundImage: scoreStyle.background } : { color: scoreStyle.color }}
        >
          {Math.round(vote.predicted_retention_pct)}%
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[8px] font-bold text-zinc-500">
          <span className={hookColor}>Hook: {vote.hook_verdict}</span>
          <div className="flex items-center gap-2">
            <span>Share {Math.round(vote.share_likelihood * 100)}%</span>
            {vote.drop_off_second !== null && (
              <span>Drop @{vote.drop_off_second}s</span>
            )}
          </div>
        </div>
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${vote.predicted_retention_pct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full rounded-full"
            style={
              vote.predicted_retention_pct >= 90
                ? { background: "linear-gradient(to right,#ec4899,#a855f7)" }
                : vote.predicted_retention_pct >= 71
                ? { background: "#a855f7" }
                : vote.predicted_retention_pct >= 41
                ? { background: "#f59e0b" }
                : { background: "#6b7280" }
            }
          />
        </div>
      </div>
      <p className="text-[9px] text-zinc-500 leading-relaxed line-clamp-2 italic border-l-2 border-white/8 pl-2">
        &ldquo;{vote.reasoning}&rdquo;
      </p>
    </motion.div>
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
  const animatedScore = useAnimatedCounter(result.weighted_consensus_score);

  return (
    <div className="flex flex-col gap-4">
      {/* Score card */}
      <div className="p-5 rounded-xl bg-zinc-800 border border-white/5 relative overflow-hidden">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500 mb-1">
              Pre-Flight Score
            </p>
            <div className="flex items-end gap-1">
              <span
                className={cn(
                  "text-5xl font-black tracking-tighter leading-none",
                  isViral && "bg-clip-text text-transparent"
                )}
                style={isViral ? {} : { color: scoreStyle.color }}
              >
                {animatedScore}
              </span>
              <span className="text-sm font-bold text-zinc-600 pb-1">/100</span>
            </div>
          </div>
          <RecommendationBadge rec={result.recommendation} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="relative h-1.5 rounded-full overflow-hidden bg-white/5">
            <div className="absolute inset-y-0 left-0 w-[40%] bg-zinc-600/40" />
            <div className="absolute inset-y-0 left-[40%] w-[30%] bg-amber-500/40" />
            <div className="absolute inset-y-0 left-[70%] w-[19%] bg-violet-500/40" />
            <div className="absolute inset-y-0 left-[89%] right-0 bg-gradient-to-r from-pink-500 to-violet-500 opacity-50" />
            <motion.div
              initial={{ left: "0%" }}
              animate={{ left: `calc(${Math.min(result.weighted_consensus_score, 99)}% - 4px)` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] z-10"
            />
          </div>
          <div className="flex justify-between text-[8px] font-bold text-zinc-600 uppercase tracking-widest">
            <span>Weak</span>
            <span>Moderate</span>
            <span>Strong</span>
            <span>Viral</span>
          </div>
        </div>
      </div>

      {/* Persona grid */}
      {result.persona_votes.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {result.persona_votes.map((vote, idx) => (
            <PersonaCard key={vote.persona_id} vote={vote} index={idx} />
          ))}
        </div>
      )}

      {/* Smart trim */}
      {result.refined_clip && (
        <div className="p-4 rounded-xl bg-violet-500/8 border border-violet-500/20 flex flex-col gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">
            Smart Trim Suggestion
          </p>
          <div className="flex items-center gap-2 text-[11px] font-black">
            <span className="text-zinc-500">
              {result.clip_candidate.start_sec.toFixed(1)}s –{" "}
              {result.clip_candidate.end_sec.toFixed(1)}s
            </span>
            <span className="text-violet-400">→</span>
            <span className="text-zinc-100">
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
              className="w-full h-8 rounded-lg bg-violet-500/15 border border-violet-500/20 text-[10px] font-black uppercase tracking-widest text-violet-400 hover:bg-violet-500/25 transition-colors"
            >
              Apply Smart Trim
            </button>
          )}
        </div>
      )}

      {/* Trend insight */}
      {result.bigquery_insight ? (
        <div className="p-3 rounded-xl bg-zinc-800 border border-white/5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-violet-400" />
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-400">
              Trend Context
            </p>
          </div>
          <p className="text-[10px] text-zinc-400 leading-relaxed border-l-2 border-violet-500/20 pl-2">
            {result.bigquery_insight}
          </p>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-zinc-900 border border-dashed border-white/8">
          <p className="text-[9px] text-zinc-600 italic">
            Add SERPAPI_KEY to env for live trend context.
          </p>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full py-2 text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] hover:text-zinc-100 transition-colors flex items-center justify-center gap-2 rounded-lg hover:bg-white/4"
      >
        <RefreshCw className="w-3 h-3" />
        Run Another Pre-Flight
      </button>
    </div>
  );
}
