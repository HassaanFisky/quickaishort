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
  SquareSplitHorizontal,
  Type,
  Layout,
  Mic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  Plus,
} from "lucide-react";
import { useUIStore, type EditorTool } from "@/stores/uiStore";
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
        enabled ? "bg-primary" : "bg-foreground/10"
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
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-foreground/5 transition-colors rounded-xl"
    >
      <span className="text-xs font-black uppercase tracking-[0.2em] text-fg-muted">
        {label}
      </span>
      <ChevronDown
        className={cn(
          "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ToolInspector — dynamic context panel driven by activeTool
// ---------------------------------------------------------------------------

const TOOL_META: Record<EditorTool, { label: string; icon: React.ElementType }> = {
  split:       { label: "Split",       icon: SquareSplitHorizontal },
  trim:        { label: "Trim",        icon: Scissors },
  text:        { label: "Text Overlay", icon: Type },
  fx:          { label: "Visual FX",   icon: Palette },
  transitions: { label: "Transitions", icon: Layout },
  voiceover:   { label: "Voiceover",   icon: Mic },
};

function ToolInspector({ tool }: { tool: EditorTool }) {
  const meta = TOOL_META[tool];
  const Icon = meta.icon;
  return (
    <motion.div
      key={tool}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col gap-4 p-4 pb-5 border-b border-border bg-primary/3"
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">{meta.label}</span>
      </div>
      {tool === "split"       && <SplitPanel />}
      {tool === "trim"        && <TrimPanel />}
      {tool === "text"        && <TextPanel />}
      {tool === "fx"          && <FXPanel />}
      {tool === "transitions" && <TransitionsPanel />}
      {tool === "voiceover"   && <VoiceoverPanel />}
    </motion.div>
  );
}

function SplitPanel() {
  const { currentTime, duration, selectedClipId, suggestions, splitClipAtTime, setPendingSeek } = useEditorStore();
  const clip = selectedClipId ? suggestions.find((c) => c.id === selectedClipId) ?? suggestions[0] : suggestions[0];
  const step = (delta: number) => setPendingSeek(Math.max(0, Math.min(duration, currentTime + delta)));
  const canSplit = clip && currentTime > clip.start + 0.5 && currentTime < clip.end - 0.5;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
          <span>Playhead</span>
          <span className="text-primary tabular-nums font-black">{currentTime.toFixed(2)}s</span>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-100"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
        </div>
        {clip && (
          <div className="flex justify-between text-[8px] text-muted-foreground tabular-nums">
            <span>{formatTime(clip.start)}</span>
            <span className="text-muted-foreground">Clip range</span>
            <span>{formatTime(clip.end)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Frame Step</span>
        <div className="flex items-center gap-1">
          {([-1, -0.1, 0.1, 1] as const).map((d) => (
            <button
              key={d}
              onClick={() => step(d)}
              className="h-7 px-2 rounded-lg bg-muted border border-border text-[9px] font-black text-fg-muted hover:text-foreground hover:border-border transition-colors tabular-nums"
            >
              {d > 0 ? `+${d}` : d}s
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => { if (canSplit) splitClipAtTime(currentTime); }}
        disabled={!canSplit}
        className={cn(
          "w-full h-9 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors",
          canSplit
            ? "bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25"
            : "bg-muted/50 border border-border text-muted-foreground cursor-not-allowed"
        )}
      >
        <SquareSplitHorizontal className="w-3.5 h-3.5" />
        Split Here
      </button>
      {!canSplit && (
        <p className="text-[9px] text-muted-foreground text-center">Move playhead inside a clip to split</p>
      )}
    </div>
  );
}

function TrimPanel() {
  const { selectedClipId, suggestions, duration, updateClip } = useEditorStore();
  const clip = selectedClipId ? suggestions.find((c) => c.id === selectedClipId) ?? suggestions[0] : suggestions[0];

  if (!clip) {
    return <p className="text-[9px] text-muted-foreground text-center">Select a clip to trim</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between text-[10px] font-bold text-fg-muted tabular-nums">
        <span>{formatTime(clip.start)}</span>
        <span className="text-muted-foreground">{Math.max(0, Math.round(clip.end - clip.start))}s</span>
        <span>{formatTime(clip.end)}</span>
      </div>
      <Slider
        value={[clip.start, clip.end]}
        min={0}
        max={duration > 0 ? duration : clip.end + 10}
        step={0.1}
        onValueChange={([s, e]: [number, number]) => updateClip(clip.id, { start: s, end: e })}
        className="py-1"
      />
      <div className="grid grid-cols-2 gap-2">
        {([["In", -0.5, true], ["In", 0.5, true], ["Out", -0.5, false], ["Out", 0.5, false]] as const).map(([lbl, delta, isStart], i) => (
          <button
            key={i}
            onClick={() => {
              if (isStart) updateClip(clip.id, { start: Math.max(0, Math.min(clip.end - 0.5, clip.start + delta)) });
              else updateClip(clip.id, { end: Math.max(clip.start + 0.5, Math.min(duration || clip.end + 10, clip.end + delta)) });
            }}
            className="h-8 rounded-lg bg-muted border border-border text-[9px] font-black text-fg-muted hover:text-foreground hover:border-border transition-colors uppercase tracking-wider"
          >
            {lbl} {delta > 0 ? `+${delta}s` : `${delta}s`}
          </button>
        ))}
      </div>
    </div>
  );
}

const FONT_OPTIONS = ["Inter", "JetBrains Mono", "Georgia", "Impact"] as const;
const TEXT_SIZES = [{ label: "S", className: "text-base font-medium" }, { label: "M", className: "text-2xl font-bold" }, { label: "L", className: "text-4xl font-black" }, { label: "XL", className: "text-6xl font-black" }] as const;
const TEXT_COLORS_PANEL = ["#ffffff", "#facc15", "#a855f7", "#ec4899", "#34d399"] as const;

function TextPanel() {
  const { addCanvasElement } = useEditorStore();
  const [font, setFont] = React.useState<string>("Inter");
  const [sizeIdx, setSizeIdx] = React.useState(1);
  const [color, setColor] = React.useState("#ffffff");
  const [align, setAlign] = React.useState<"left" | "center" | "right">("center");
  const [position, setPosition] = React.useState<"top" | "middle" | "bottom">("middle");
  const posY = position === "top" ? 80 : position === "bottom" ? 700 : 350;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Font</span>
        <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border flex-wrap">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFont(f)}
              className={cn(
                "flex-1 h-7 rounded-md text-[9px] font-bold transition-colors whitespace-nowrap px-1",
                font === f ? "bg-primary text-white" : "text-fg-muted hover:text-foreground"
              )}
              style={{ fontFamily: f }}
            >
              {f.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Size</span>
        <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border">
          {TEXT_SIZES.map(({ label }, i) => (
            <button
              key={label}
              onClick={() => setSizeIdx(i)}
              className={cn(
                "w-8 h-7 rounded-md text-[10px] font-black transition-colors",
                sizeIdx === i ? "bg-primary text-white" : "text-fg-muted hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Color</span>
        <div className="flex gap-1.5">
          {TEXT_COLORS_PANEL.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn("w-6 h-6 rounded-full border-2 transition-all", color === c ? "border-white scale-110" : "border-transparent hover:border-border")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Align</span>
        <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border">
          {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
            <button
              key={a}
              onClick={() => setAlign(a)}
              className={cn("w-8 h-7 rounded-md flex items-center justify-center transition-colors", align === a ? "bg-primary text-white" : "text-fg-muted hover:text-foreground")}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Position</span>
        <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border">
          {(["top", "middle", "bottom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPosition(p)}
              className={cn("h-7 px-2.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-colors", position === p ? "bg-primary text-white" : "text-fg-muted hover:text-foreground")}
            >
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => addCanvasElement({
          type: "text",
          content: "NEW TEXT",
          x: align === "left" ? 40 : align === "right" ? 160 : 100,
          y: posY,
          scale: 1 + sizeIdx * 0.3,
          rotation: 0,
          style: { className: cn(TEXT_SIZES[sizeIdx].className), color },
        })}
        className="w-full h-9 rounded-xl bg-primary/15 border border-primary/30 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/25 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-3.5 h-3.5" />
        Add to Canvas
      </button>
    </div>
  );
}

const FILTER_PANEL_OPTIONS = ["None", "Urban", "Retro", "Cinematic"] as const;

function FXPanel() {
  const { exportSettings, setExportSetting } = useEditorStore();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Style Preset</span>
        <div className="grid grid-cols-2 gap-1.5">
          {FILTER_PANEL_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setExportSetting("filter", f as typeof exportSettings.filter)}
              className={cn(
                "h-9 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors",
                exportSettings.filter === f
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-muted border-border text-fg-muted hover:text-foreground hover:border-border"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <SliderRow label="Audio Boost" value={exportSettings.audioBoost} display={`${exportSettings.audioBoost}%`} min={0} max={200} step={1} onChange={(v) => setExportSetting("audioBoost", v)} />
      <SliderRow label="Noise Reduction" value={exportSettings.noiseSuppression} display={`${exportSettings.noiseSuppression}%`} min={0} max={100} step={1} onChange={(v) => setExportSetting("noiseSuppression", v)} />
      <SliderRow label="Playback Speed" value={exportSettings.playbackSpeed} display={`${(exportSettings.playbackSpeed / 100).toFixed(1)}x`} min={50} max={200} step={5} onChange={(v) => setExportSetting("playbackSpeed", v)} />
    </div>
  );
}

const TRANSITION_TYPES = ["Fade", "Slide", "Zoom", "Cut"] as const;

function TransitionsPanel() {
  const { exportSettings, setExportSetting } = useEditorStore();
  const [type, setType] = React.useState<typeof TRANSITION_TYPES[number]>("Fade");
  const [durationMs, setDurationMs] = React.useState(400);

  return (
    <div className="flex flex-col gap-4">
      <ToggleRow
        label="Enable Transitions"
        sub="Crossfade between clips"
        enabled={exportSettings.transitionEnabled}
        onToggle={() => setExportSetting("transitionEnabled", !exportSettings.transitionEnabled)}
        ariaLabel="Toggle transitions"
      />
      {exportSettings.transitionEnabled && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Type</span>
            <div className="grid grid-cols-2 gap-1.5">
              {TRANSITION_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "h-9 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors",
                    type === t
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-muted border-border text-fg-muted hover:text-foreground hover:border-border"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Duration</span>
              <span className="text-[9px] font-bold text-primary tabular-nums">{durationMs}ms</span>
            </div>
            <Slider value={[durationMs]} min={100} max={1500} step={50} onValueChange={([v]: [number]) => setDurationMs(v)} className="py-1" />
          </div>
        </>
      )}
    </div>
  );
}

const VOICE_STYLES = ["Natural", "Dramatic", "Upbeat", "News"] as const;

function VoiceoverPanel() {
  const { exportSettings, setExportSetting } = useEditorStore();
  const [style, setStyle] = React.useState<typeof VOICE_STYLES[number]>("Natural");
  const [mixLevel, setMixLevel] = React.useState(70);

  return (
    <div className="flex flex-col gap-4">
      <ToggleRow
        label="AI Voiceover"
        sub="Synthetic narration track"
        enabled={exportSettings.voiceoverEnabled}
        onToggle={() => {
          const next = !exportSettings.voiceoverEnabled;
          setExportSetting("voiceoverEnabled", next);
          if (next) setExportSetting("audioBoost", 150);
        }}
        ariaLabel="Toggle voiceover"
      />
      {exportSettings.voiceoverEnabled && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Voice Style</span>
            <div className="grid grid-cols-2 gap-1.5">
              {VOICE_STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={cn(
                    "h-9 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors",
                    style === s
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-muted border-border text-fg-muted hover:text-foreground hover:border-border"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Voice / Original Mix</span>
              <span className="text-[9px] font-bold text-primary tabular-nums">{mixLevel}%</span>
            </div>
            <Slider value={[mixLevel]} min={0} max={100} step={5} onValueChange={([v]: [number]) => setMixLevel(v)} className="py-1" />
          </div>
        </>
      )}
    </div>
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

  const { activeTool } = useUIStore();
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

  const handleExport = useCallback(() => {
    exportClip({ quality: exportSettings.quality, captionsEnabled });
  }, [exportClip, exportSettings.quality, captionsEnabled]);

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

  // Shortcut actions arrive as window events from the editor's binding engine
  // (single source of truth lives in shortcutsStore — see app/editor/page.tsx).
  useEffect(() => {
    const onPreflight = () => {
      if (selectedClip && !isPreflightRunning) handleRunPreflight();
    };
    const onExport = () => {
      if (selectedClip && (sourceFile || sourceUrl) && !isExporting) handleExport();
    };
    window.addEventListener("qai:preflight", onPreflight);
    window.addEventListener("qai:export", onExport);
    return () => {
      window.removeEventListener("qai:preflight", onPreflight);
      window.removeEventListener("qai:export", onExport);
    };
  }, [selectedClip, isPreflightRunning, handleRunPreflight, handleExport, isExporting, sourceFile, sourceUrl]);

  // ------------------------------------------------------------------
  // ZERO STATE — show ToolInspector if a tool is active, else placeholder
  // ------------------------------------------------------------------
  if (isZeroState) {
    if (activeTool) {
      return (
        <div className="flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            <ToolInspector key={activeTool} tool={activeTool as EditorTool} />
          </AnimatePresence>
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-[10px] text-muted-foreground font-medium text-center max-w-[160px] leading-relaxed">
              Import a video to enable clip-level properties
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="w-full rounded-2xl bg-card/40 border border-border p-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-[180px]">
            Select a tool or import a video to get started
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // ACTIVE STATE — Accordion inspector + optional ToolInspector
  // ------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-1 pb-6">
      {/* Active tool context panel — shown above accordion when a tool is active */}
      <AnimatePresence mode="wait">
        {activeTool && <ToolInspector key={activeTool} tool={activeTool as EditorTool} />}
      </AnimatePresence>

      <div className="flex flex-col gap-1 p-4">
      {/* Clip meta */}
      <div className="px-1 pb-3 border-b border-border mb-1">
        <h3 className="text-[11px] font-black text-foreground truncate uppercase tracking-tight">
          {sourceFile?.name ??
            (selectedClip
              ? `Clip ${selectedClip.id.slice(0, 4).toUpperCase()}`
              : "Selection")}
        </h3>
        {selectedClip && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            <Clock3 className="w-3 h-3" />
            <span>
              {formatTime(selectedClip.start)} — {formatTime(selectedClip.end)}
            </span>
            <span className="text-primary">{clipDuration}s</span>
          </div>
        )}
      </div>

      {/* â"€â"€ Group 1: Basic & Audio â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="rounded-xl border border-border overflow-hidden">
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
              <div className="px-4 pb-4 flex flex-col gap-4 border-t border-border pt-3">
                {/* Precision Trim */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Scissors className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">
                      Precision Trim
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-fg-muted tabular-nums">
                    <span>{selectedClip ? formatTime(selectedClip.start) : "—"}</span>
                    <span className="text-muted-foreground">
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
                      onValueChange={([s, e]: [number, number]) =>
                        updateClip(selectedClip.id, { start: s, end: e })
                      }
                      className="py-1"
                    />
                  ) : (
                    <div className="h-8 flex items-center justify-center">
                      <span className="text-[9px] text-muted-foreground uppercase tracking-widest">
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

      {/* â"€â"€ Group 2: Captions & Visuals â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="rounded-xl border border-border overflow-hidden">
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
              <div className="px-4 pb-4 flex flex-col gap-4 border-t border-border pt-3">
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
                    <Palette className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">
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
                            ? "bg-primary/15 border-primary/30 text-primary"
                            : "bg-muted border-border text-fg-muted hover:text-foreground"
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

      {/* ── Group 3: Export ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
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
              <div className="px-4 pb-5 flex flex-col gap-5 border-t border-border pt-4">
                {/* Output format — calm segmented controls, sentence case */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">Quality</span>
                    <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl border border-border">
                      {QUALITY_OPTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => setExportSetting("quality", q)}
                          className={cn(
                            "flex-1 h-8 rounded-lg text-[11px] font-semibold capitalize transition-colors",
                            quality === q
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">Format</span>
                    <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl border border-border">
                      {(["9:16", "1:1"] as const).map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => setExportSetting("aspectRatio", ratio)}
                          aria-pressed={exportSettings.aspectRatio === ratio}
                          className={cn(
                            "flex-1 h-8 rounded-lg text-[11px] font-semibold tabular-nums transition-colors",
                            exportSettings.aspectRatio === ratio
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action / state — final step of the journey, kept emotionally calm */}
                <AnimatePresence mode="wait">
                  {exportDone ? (
                    <motion.div
                      key="export-done"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="flex flex-col gap-3"
                    >
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 flex flex-col items-center text-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-emerald-500/15 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Your short is ready</p>
                          <p className="text-[12px] text-muted-foreground mt-0.5 capitalize">
                            {quality} quality · {exportSettings.aspectRatio}
                          </p>
                        </div>
                      </div>
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
                        className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:brightness-110 transition"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      <button
                        onClick={() => resetExportState()}
                        className="w-full h-9 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Export again
                      </button>
                    </motion.div>
                  ) : exportError ? (
                    <motion.div
                      key="export-error"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="flex flex-col gap-3"
                    >
                      <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-4 flex flex-col gap-1">
                        <p className="text-sm font-bold text-destructive">Export failed</p>
                        <p className="text-[12px] text-muted-foreground leading-relaxed">{exportError}</p>
                      </div>
                      <button
                        onClick={() => {
                          resetExportState();
                          handleExport();
                        }}
                        className="w-full h-12 rounded-2xl bg-secondary/50 border border-border flex items-center justify-center gap-2 text-foreground font-semibold text-sm hover:bg-secondary transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Try again
                      </button>
                    </motion.div>
                  ) : isExporting ? (
                    <motion.div
                      key="export-progress"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="rounded-2xl border border-border bg-secondary/40 p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-foreground flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          Rendering your short…
                        </span>
                        <span className="text-[12px] font-bold text-primary tabular-nums">{exportProgress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${exportProgress}%` }}
                          transition={{ ease: "easeOut", duration: 0.3 }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Usually under a minute — feel free to keep editing.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="export-idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col gap-2"
                    >
                      <button
                        className={cn(
                          "w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition",
                          !selectedClip || (!sourceFile && !sourceUrl)
                            ? "bg-secondary/50 text-muted-foreground cursor-not-allowed"
                            : "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110"
                        )}
                        onClick={handleExport}
                        disabled={!selectedClip || (!sourceFile && !sourceUrl)}
                      >
                        <Download className="w-4 h-4" />
                        Export Short
                      </button>
                      <p className="text-center text-[11px] text-muted-foreground capitalize">
                        {quality} · {exportSettings.aspectRatio} · captions {captionsEnabled ? "on" : "off"}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* â"€â"€ Pre-Flight "" shown below accordion when clip is selected â"€â"€ */}
      {hasClip && (
        <div className="mt-2 pt-4 border-t border-border flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">
                Audience Preview
              </span>
            </div>
            <span className="text-[9px] font-bold text-muted-foreground tracking-tighter">
              Shift+P
            </span>
          </div>

          {!preflightResult && !isPreflightRunning && !isPremiumGated && (
            <div
              className="p-6 rounded-xl bg-muted/50 border border-border flex flex-col items-center gap-4 cursor-pointer hover:bg-muted transition-colors"
              onClick={handleRunPreflight}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-xs font-black text-foreground uppercase tracking-widest">
                  Test with Audience
                </p>
                <p className="text-[10px] text-muted-foreground max-w-[180px]">
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
        <span className="text-[10px] font-black text-fg-muted uppercase tracking-widest">
          {label}
        </span>
        <span className="text-[10px] font-bold text-primary tabular-nums">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]: [number]) => onChange(v)}
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
        <span className="text-[11px] font-black uppercase tracking-widest text-foreground">
          {label}
        </span>
        <span className="text-[9px] font-medium text-muted-foreground">{sub}</span>
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
      className="p-3 rounded-xl bg-muted border border-border flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm leading-none">{label.emoji}</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
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
        <div className="flex justify-between text-[8px] font-bold text-muted-foreground">
          <span className={hookColor}>Hook: {vote.hook_verdict}</span>
          <div className="flex items-center gap-2">
            <span>Share {Math.round(vote.share_likelihood * 100)}%</span>
            {vote.drop_off_second !== null && (
              <span>Drop @{vote.drop_off_second}s</span>
            )}
          </div>
        </div>
        <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
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
      <p className="text-[9px] text-muted-foreground leading-relaxed line-clamp-2 italic border-l-2 border-border pl-2">
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
      <div className="p-5 rounded-xl bg-muted border border-border relative overflow-hidden">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-1">
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
              <span className="text-sm font-bold text-muted-foreground pb-1">/100</span>
            </div>
          </div>
          <RecommendationBadge rec={result.recommendation} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="relative h-1.5 rounded-full overflow-hidden bg-foreground/10">
            <div className="absolute inset-y-0 left-0 w-[40%] bg-muted-foreground/30" />
            <div className="absolute inset-y-0 left-[40%] w-[30%] bg-amber-500/40" />
            <div className="absolute inset-y-0 left-[70%] w-[19%] bg-primary/40" />
            <div className="absolute inset-y-0 left-[89%] right-0 bg-gradient-to-r from-pink-500 to-primary opacity-50" />
            <motion.div
              initial={{ left: "0%" }}
              animate={{ left: `calc(${Math.min(result.weighted_consensus_score, 99)}% - 4px)` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] z-10"
            />
          </div>
          <div className="flex justify-between text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
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
        <div className="p-4 rounded-xl bg-primary/8 border border-primary/20 flex flex-col gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            Smart Trim Suggestion
          </p>
          <div className="flex items-center gap-2 text-[11px] font-black">
            <span className="text-muted-foreground">
              {result.clip_candidate.start_sec.toFixed(1)}s —{" "}
              {result.clip_candidate.end_sec.toFixed(1)}s
            </span>
            <span className="text-primary">→</span>
            <span className="text-foreground">
              {result.refined_clip.start_sec.toFixed(1)}s —{" "}
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
              className="w-full h-8 rounded-lg bg-primary/15 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/25 transition-colors"
            >
              Apply Smart Trim
            </button>
          )}
        </div>
      )}

      {/* Trend insight */}
      {result.bigquery_insight ? (
        <div className="p-3 rounded-xl bg-muted border border-border flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-primary" />
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">
              Trend Context
            </p>
          </div>
          <p className="text-[10px] text-fg-muted leading-relaxed border-l-2 border-primary/20 pl-2">
            {result.bigquery_insight}
          </p>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-card border border-dashed border-border">
          <p className="text-[9px] text-muted-foreground italic">
            Add SERPAPI_KEY to env for live trend context.
          </p>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full py-2 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] hover:text-foreground transition-colors flex items-center justify-center gap-2 rounded-lg hover:bg-foreground/5"
      >
        <RefreshCw className="w-3 h-3" />
        Run Another Pre-Flight
      </button>
    </div>
  );
}
