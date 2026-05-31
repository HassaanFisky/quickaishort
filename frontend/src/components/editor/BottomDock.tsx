"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore, type EditorTool } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import type { Clip } from "@/types/pipeline";
import {
  Play,
  Pause,
  Square,
  Scissors,
  Type,
  Wand2,
  Mic,
  Layout,
  SquareSplitHorizontal,
  GripVertical,
  Undo2,
  Redo2,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils/formatTime";
import { toast } from "sonner";

// ---- TimelineClip Component with Trim & Drag Support ----
function TimelineClip({
  clip,
  duration,
  isSelected,
  onSelect,
}: {
  clip: Clip;
  duration: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { updateClip, setPendingSeek } = useEditorStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<"move" | "start" | "end" | null>(null);
  const startX = useRef(0);
  const startStart = useRef(0);
  const startEnd = useRef(0);

  const handleMouseDown = (e: React.MouseEvent, type: "move" | "start" | "end") => {
    e.stopPropagation();
    setIsDragging(true);
    setDragType(type);
    startX.current = e.clientX;
    startStart.current = clip.start;
    startEnd.current = clip.end;
    onSelect();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX.current;
      const timelineWidth = document.getElementById("video-track-area")?.clientWidth || 1;
      const deltaT = (deltaX / timelineWidth) * duration;

      if (dragType === "move") {
        const newStart = Math.max(0, Math.min(duration - (startEnd.current - startStart.current), startStart.current + deltaT));
        const diff = startEnd.current - startStart.current;
        updateClip(clip.id, { start: newStart, end: newStart + diff });
      } else if (dragType === "start") {
        const newStart = Math.max(0, Math.min(clip.end - 0.5, startStart.current + deltaT));
        updateClip(clip.id, { start: newStart });
      } else if (dragType === "end") {
        const newEnd = Math.max(clip.start + 0.5, Math.min(duration, startEnd.current + deltaT));
        updateClip(clip.id, { end: newEnd });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragType, duration, clip.id, clip.start, clip.end, updateClip]);

  const left = ((clip.start / duration) * 100).toFixed(2);
  const width = (((clip.end - clip.start) / duration) * 100).toFixed(2);

  return (
    <div
      className={cn(
        "absolute top-0.5 bottom-0.5 rounded-md flex items-center transition-shadow select-none",
        isSelected
          ? "bg-gradient-to-r from-primary/40 to-primary/20 border-2 border-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)] z-10"
          : "bg-foreground/10 border border-foreground/10 hover:bg-foreground/20",
        isDragging && "opacity-80 scale-[1.02] z-50",
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
      onMouseDown={(e) => handleMouseDown(e, "move")}
    >
      {/* Left Trim Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-primary/50 rounded-l-md"
        onMouseDown={(e) => handleMouseDown(e, "start")}
      />
      
      {/* Middle Label / Grabber */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-2 pointer-events-none">
        <GripVertical className="w-2.5 h-2.5 text-foreground/20 mr-1 shrink-0" />
        <span
          className={cn(
            "text-[8px] font-bold truncate uppercase tracking-tighter",
            isSelected ? "text-primary" : "text-muted-foreground",
          )}
        >
          {clip.start.toFixed(1)}s – {clip.end.toFixed(1)}s
        </span>
      </div>

      {/* Right Trim Handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-primary/50 rounded-r-md"
        onMouseDown={(e) => handleMouseDown(e, "end")}
      />
    </div>
  );
}

// ---- Main BottomDock ----
export default function BottomDock() {
  const {
    transcript,
    suggestions,
    duration,
    currentTime,
    isPlaying,
    isProcessing,
    setIsPlaying,
    setCurrentTime,
    setPendingSeek,
    selectedClipId,
    selectClip,
    splitClipAtTime,
    addCanvasElement,
    setExportSetting,
    exportSettings,
    audioData,
    silenceSegments,
    undoStack,
    redoStack,
    undo,
    redo,
    deleteClip,
  } = useEditorStore();

  const { activeTool, setActiveTool } = useUIStore();
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const isDraggingPlayhead = useRef(false);

  // Amplitude peaks per pixel column — used to draw the canvas waveform.
  const waveformPeaks = useMemo(() => {
    if (!audioData || audioData.length === 0) return null;
    const barCount = 120;
    const step = Math.floor(audioData.length / barCount);
    return Array.from({ length: barCount }, (_, i) => {
      let sum = 0;
      for (let j = i * step; j < (i + 1) * step && j < audioData.length; j++) {
        sum += Math.abs(audioData[j]);
      }
      return Math.max(0.01, Math.min(1, (sum / step) * 10));
    });
  }, [audioData]);

  // Redraw waveform canvas whenever peaks, playhead, or silence segments change.
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !waveformPeaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const barW = w / waveformPeaks.length;
    const playedPct = duration > 0 ? currentTime / duration : 0;

    waveformPeaks.forEach((amp, i) => {
      const x = i * barW;
      const barH = Math.max(2, amp * h * 0.85);
      const y = (h - barH) / 2;
      const timePct = i / waveformPeaks.length;
      const inSilence = silenceSegments.some(
        (seg) => timePct * duration >= seg.start && timePct * duration <= seg.end,
      );

      ctx.fillStyle = inSilence
        ? "rgba(239,68,68,0.45)"
        : timePct < playedPct
          ? "rgba(168,85,247,0.85)"
          : "rgba(168,85,247,0.35)";

      ctx.fillRect(x + 0.5, y, Math.max(1, barW - 1), barH);
    });

    // Playhead line
    if (duration > 0) {
      const px = playedPct * w;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }, [waveformPeaks, currentTime, duration, silenceSegments]);


  const stopPlayback = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setPendingSeek(0);
  };

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const videoTrackRef = useRef<HTMLDivElement>(null);

  const seekToEvent = useCallback(
    (clientX: number) => {
      if (!videoTrackRef.current || duration === 0) return;
      const rect = videoTrackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setPendingSeek(pct * duration);
    },
    [duration, setPendingSeek],
  );

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      seekToEvent(e.clientX);
      isDraggingPlayhead.current = true;
      const onMove = (ev: MouseEvent) => {
        if (isDraggingPlayhead.current) seekToEvent(ev.clientX);
      };
      const onUp = () => {
        isDraggingPlayhead.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [seekToEvent],
  );

  const handleSplit = useCallback(() => {
    const clip = selectedClipId
      ? suggestions.find((c) => c.id === selectedClipId)
      : suggestions[0];

    if (!clip) {
      toast.error("Select a clip on the timeline first.");
      return;
    }
    if (currentTime <= clip.start + 1 || currentTime >= clip.end - 1) {
      toast.error(
        `Playhead must be inside the clip (${formatTime(clip.start + 1)} – ${formatTime(clip.end - 1)}).`,
      );
      return;
    }
    splitClipAtTime(currentTime);
    toast.success(`Clip split at ${formatTime(currentTime)}`);
  }, [currentTime, selectedClipId, suggestions, splitClipAtTime]);

  const handleAddText = useCallback(() => {
    addCanvasElement({
      type: "text",
      content: "NEW TEXT",
      x: 100,
      y: 200,
      scale: 1.5,
      rotation: 0,
      style: { className: "text-4xl font-black text-white" },
    });
    toast.success("Text added to canvas.");
  }, [addCanvasElement]);

  const FILTER_CYCLE = ["None", "Urban", "Retro", "Cinematic"] as const;
  type FilterOption = typeof FILTER_CYCLE[number];

  const handleFX = useCallback(() => {
    const currentIdx = FILTER_CYCLE.indexOf(exportSettings.filter as FilterOption);
    const nextFilter = FILTER_CYCLE[(currentIdx + 1) % FILTER_CYCLE.length];
    setExportSetting("filter", nextFilter);
    toast.success(`FX changed to: ${nextFilter}`);
  }, [exportSettings.filter, setExportSetting]);

  const handleTransitions = useCallback(() => {
    const nextVal = !exportSettings.transitionEnabled;
    setExportSetting("transitionEnabled", nextVal);
    toast.success(nextVal ? "Crossfade transitions enabled!" : "Transitions disabled.");
  }, [exportSettings.transitionEnabled, setExportSetting]);

  const handleVoiceover = useCallback(() => {
    const nextVal = !exportSettings.voiceoverEnabled;
    setExportSetting("voiceoverEnabled", nextVal);
    if (nextVal) {
      setExportSetting("audioBoost", 150); // Automatically boost audio to support voiceover freq
    }
    toast.success(nextVal ? "AI Voiceover Track/Enhancement enabled." : "Voiceover disabled.");
  }, [exportSettings.voiceoverEnabled, setExportSetting]);

  const tools: Array<{
    icon: LucideIcon;
    label: string;
    toolId: EditorTool;
    action: () => void;
    tooltip: string;
  }> = [
    {
      icon: SquareSplitHorizontal,
      label: "Split",
      toolId: "split",
      action: handleSplit,
      tooltip: "Split — S — Cut clip at playhead",
    },
    {
      icon: Scissors,
      label: "Trim",
      toolId: "trim",
      action: () => toast.info("Drag clip edges on the timeline to trim."),
      tooltip: "Trim — Drag clip edges to resize",
    },
    {
      icon: Type,
      label: "Text",
      toolId: "text",
      action: handleAddText,
      tooltip: "Text — T — Add text overlay to canvas",
    },
    {
      icon: Wand2,
      label: "FX",
      toolId: "fx",
      action: handleFX,
      tooltip: `FX — Visual filter (current: ${exportSettings.filter})`,
    },
    {
      icon: Layout,
      label: "Transitions",
      toolId: "transitions",
      action: handleTransitions,
      tooltip: "Transitions — Toggle crossfade between clips",
    },
    {
      icon: Mic,
      label: "Voiceover",
      toolId: "voiceover",
      action: handleVoiceover,
      tooltip: "Voiceover — Toggle AI voice enhancement",
    },
  ];

  return (
    <div className="w-full h-full flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => undo()}
            title="Undo — Ctrl+Z"
            aria-label="Undo"
            disabled={undoStack.length === 0}
            className="undo-btn h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Undo2 className="undo-icon w-4 h-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => redo()}
            title="Redo — Ctrl+Shift+Z"
            aria-label="Redo"
            disabled={redoStack.length === 0}
            className="redo-btn h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Redo2 className="redo-icon w-4 h-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={isPlaying ? "Pause" : "Play"}
            className="w-8 h-8 text-foreground/60 hover:text-primary transition-colors"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Stop"
            className="w-8 h-8 text-foreground/60 hover:text-primary transition-colors"
            onClick={stopPlayback}
          >
            <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
          </Button>
          <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums select-none">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-5">
          {tools.map(({ icon: Icon, label, toolId, action, tooltip }) => {
            const isActive = activeTool === toolId;
            return (
              <button
                key={label}
                onClick={() => { action(); setActiveTool(toolId); }}
                title={tooltip}
                aria-label={tooltip}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-2 group cursor-pointer focus:outline-none transition-all duration-200",
                  isActive && "relative"
                )}
              >
                {isActive && (
                  <span className="absolute -inset-x-2 -inset-y-1 rounded-lg bg-primary/10 border border-primary/20 pointer-events-none" />
                )}
                <Icon
                  className={cn(
                    "w-4 h-4 transition-colors relative",
                    isActive ? "text-primary" : "text-foreground/40 group-hover:text-primary"
                  )}
                  aria-hidden={true}
                />
                <span
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest transition-colors relative",
                    isActive ? "text-primary" : "text-foreground/40 group-hover:text-primary"
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
          {selectedClipId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                deleteClip(selectedClipId);
                toast.success("Clip deleted");
              }}
              title="Delete — Del/Backspace — Remove selected clip"
              className="flex items-center gap-2 group cursor-pointer focus:outline-none h-auto py-0 px-0"
            >
              <Trash2 className="w-4 h-4 text-red-400/40 group-hover:text-red-400 transition-colors" />
              <span className="text-[10px] font-black text-red-400/40 uppercase tracking-widest group-hover:text-red-400 transition-colors">
                Delete
              </span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
        <TimeScale duration={duration} />

        {/* Video Track Area */}
        <div className="flex gap-4 items-center group">
          <span className="w-16 text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest text-right shrink-0">
            Video
          </span>
          <div
            id="video-track-area"
            ref={videoTrackRef}
            onMouseDown={handleTrackMouseDown}
            onMouseMove={(e) => {
              if (!videoTrackRef.current || duration === 0) return;
              const rect = videoTrackRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              setHoverX(x);
              setHoverTime((x / rect.width) * duration);
            }}
            onMouseLeave={() => setHoverTime(null)}
            className="flex-1 h-8 rounded-lg bg-foreground/5 border border-foreground/5 relative overflow-visible cursor-crosshair"
          >
            {isProcessing ? (
              /* Pulsing skeleton while pipeline is running */
              <div className="absolute inset-0 flex items-end gap-[2px] px-2 py-1 pointer-events-none">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-primary/25 animate-pulse"
                    style={{
                      height: `${20 + ((i * 13 + 7) % 55)}%`,
                      animationDelay: `${(i * 60) % 800}ms`,
                      animationDuration: "1.2s",
                    }}
                  />
                ))}
              </div>
            ) : duration > 0 && suggestions.length > 0 ? (
              suggestions.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  duration={duration}
                  isSelected={clip.id === selectedClipId}
                  onSelect={() => selectClip(clip.id)}
                />
              ))
            ) : (
              <div className="flex items-center justify-center h-full pointer-events-none">
                <span className="text-[8px] text-muted-foreground/30 uppercase tracking-widest">
                  {duration === 0 ? "No video" : "No clips"}
                </span>
              </div>
            )}

            {/* AI hook markers — clips with viralAnalysis.score > 70 */}
            {suggestions
              .filter((c) => (c.viralAnalysis?.score ?? 0) > 70)
              .map((clip) => (
                <div
                  key={`hook-${clip.id}`}
                  className="absolute top-0 w-0.5 bg-emerald-400/70 z-20 pointer-events-none"
                  style={{ left: `${(clip.start / duration) * 100}%`, height: "100%" }}
                  title={`Hook — Score: ${clip.viralAnalysis?.score}`}
                />
              ))}

            {/* Silence markers */}
            {silenceSegments.map((seg, i) => (
              <div
                key={`silence-${i}`}
                className="absolute top-0 bottom-0 bg-red-500/15 border-x border-red-500/30 pointer-events-none z-5"
                style={{
                  left: `${(seg.start / duration) * 100}%`,
                  width: `${((seg.end - seg.start) / duration) * 100}%`,
                }}
                title={`Silence: ${seg.start.toFixed(1)}s – ${seg.end.toFixed(1)}s`}
              />
            ))}

            {/* Playhead */}
            {duration > 0 && (
              <div
                className="absolute top-[-30px] bottom-[-10px] w-0.5 bg-foreground z-30 pointer-events-none"
                style={{ left: `${playheadPct}%` }}
              >
                <div className="absolute -top-1 -left-[3px] w-2 h-2 bg-foreground rotate-45 shadow-[0_0_10px_white/30]" />
              </div>
            )}

            {/* Hover time indicator */}
            {hoverTime !== null && duration > 0 && (
              <div
                className="absolute -top-7 z-40 px-1.5 py-0.5 rounded bg-foreground/90 text-background text-[9px] font-black pointer-events-none -translate-x-1/2 whitespace-nowrap"
                style={{ left: hoverX }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>
        </div>

        {/* Audio Track */}
        <div className="flex gap-4 items-center group">
          <span className="w-16 text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest text-right shrink-0">
            Audio
          </span>
          <div className="flex-1 h-7 rounded-lg bg-foreground/5 border border-foreground/5 relative overflow-hidden">
            {waveformPeaks ? (
              <canvas
                ref={waveformCanvasRef}
                className="absolute inset-0 w-full h-full"
                aria-hidden="true"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <span className="text-[8px] text-muted-foreground/30 uppercase tracking-widest">
                  No audio data
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeScale({ duration }: { duration: number }) {
  if (duration === 0) return <div className="h-4 pl-20" />;
  const markers = [0, 0.25, 0.5, 0.75].map((frac) => frac * duration);
  return (
    <div className="flex items-center h-4 pl-20 pr-4 justify-between text-[8px] font-black text-muted-foreground/30 uppercase tracking-[0.3em]">
      {markers.map((t) => <span key={t}>{formatTime(t)}</span>)}
    </div>
  );
}
