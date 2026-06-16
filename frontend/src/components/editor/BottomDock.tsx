"use client";

import { useRef, useState, useCallback, useEffect } from "react";
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
  Minus,
  Plus,
  Maximize2,
  ScanLine,
  Music,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils/formatTime";
import { toast } from "sonner";
import MultiTrackTimeline from "@/components/editor/MultiTrackTimeline";
import { detectScenes } from "@/lib/sceneDetection";
import { detectBeats } from "@/lib/beatDetection";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useLongPress, usePinchGesture } from "@/hooks/useTouchGestures";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PINCH_HINT_KEY = "qai_pinch_hint_seen";

// ---- TimelineClip Component with Trim & Drag Support ----
function TimelineClip({
  clip,
  duration,
  isSelected,
  isMobile,
  onSelect,
  onContextMenu,
  onOpenInspector,
}: {
  clip: Clip;
  duration: number;
  isSelected: boolean;
  isMobile: boolean;
  onSelect: () => void;
  onContextMenu: (point: { clientX: number; clientY: number }, clipId: string) => void;
  onOpenInspector: () => void;
}) {
  const { updateClip, setPendingSeek } = useEditorStore();
  const playbackSpeed = useEditorStore((s) => s.exportSettings.playbackSpeed);
  const setSnapLine = useUIStore((s) => s.setSnapLine);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<"move" | "start" | "end" | null>(null);
  const startX = useRef(0);
  const startStart = useRef(0);
  const startEnd = useRef(0);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const lastTapAt = useRef(0);

  useLongPress(clipRef, {
    enabled: isMobile,
    onLongPress: (point) => {
      onSelect();
      onContextMenu(point, clip.id);
    },
  });

  const handleTap = useCallback(() => {
    const now = performance.now();
    if (now - lastTapAt.current < 350) {
      onOpenInspector();
      lastTapAt.current = 0;
    } else {
      lastTapAt.current = now;
    }
  }, [onOpenInspector]);

  const handleMouseDown = (e: React.MouseEvent, type: "move" | "start" | "end") => {
    e.stopPropagation();
    setIsDragging(true);
    setDragType(type);
    startX.current = e.clientX;
    startStart.current = clip.start;
    startEnd.current = clip.end;
    onSelect();
    if (isMobile && type === "move") handleTap();
  };

  useEffect(() => {
    if (!isDragging) return;

    const SNAP_THRESHOLD = 0.2;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX.current;
      const timelineWidth = document.getElementById("video-track-area")?.clientWidth || 1;
      const deltaT = (deltaX / timelineWidth) * duration;
      const allClips = useEditorStore.getState().suggestions;

      if (dragType === "move") {
        const rawStart = Math.max(0, Math.min(duration - (startEnd.current - startStart.current), startStart.current + deltaT));
        const diff = startEnd.current - startStart.current;
        let finalStart = rawStart;
        let snapAt: number | null = null;
        for (const other of allClips) {
          if (other.id === clip.id) continue;
          for (const edge of [other.start, other.end]) {
            if (Math.abs(rawStart - edge) < SNAP_THRESHOLD) { finalStart = edge; snapAt = edge; break; }
          }
          if (snapAt !== null) break;
          for (const edge of [other.start, other.end]) {
            if (Math.abs(rawStart + diff - edge) < SNAP_THRESHOLD) { finalStart = edge - diff; snapAt = edge; break; }
          }
          if (snapAt !== null) break;
        }
        setSnapLine(snapAt);
        const newStart = Math.max(0, Math.min(duration - diff, finalStart));
        updateClip(clip.id, { start: newStart, end: newStart + diff });
      } else if (dragType === "start") {
        const rawStart = Math.max(0, Math.min(clip.end - 0.5, startStart.current + deltaT));
        let finalStart = rawStart;
        let snapAt: number | null = null;
        for (const other of allClips) {
          if (other.id === clip.id) continue;
          for (const edge of [other.start, other.end]) {
            if (Math.abs(rawStart - edge) < SNAP_THRESHOLD) { finalStart = edge; snapAt = edge; break; }
          }
          if (snapAt !== null) break;
        }
        setSnapLine(snapAt);
        updateClip(clip.id, { start: Math.max(0, Math.min(finalStart, clip.end - 0.5)) });
      } else if (dragType === "end") {
        const rawEnd = Math.max(clip.start + 0.5, Math.min(duration, startEnd.current + deltaT));
        let finalEnd = rawEnd;
        let snapAt: number | null = null;
        for (const other of allClips) {
          if (other.id === clip.id) continue;
          for (const edge of [other.start, other.end]) {
            if (Math.abs(rawEnd - edge) < SNAP_THRESHOLD) { finalEnd = edge; snapAt = edge; break; }
          }
          if (snapAt !== null) break;
        }
        setSnapLine(snapAt);
        updateClip(clip.id, { end: Math.max(finalEnd, clip.start + 0.5) });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
      setSnapLine(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragType, duration, clip.id, clip.start, clip.end, updateClip, setSnapLine]);

  const left = ((clip.start / duration) * 100).toFixed(2);
  const width = (((clip.end - clip.start) / duration) * 100).toFixed(2);

  return (
    <div
      ref={clipRef}
      className={cn(
        "absolute top-0.5 bottom-0.5 rounded-md flex items-center transition-shadow select-none touch-manipulation",
        isSelected
          ? "bg-gradient-to-r from-primary/40 to-primary/20 border-2 border-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)] z-10"
          : "bg-foreground/10 border border-foreground/10 hover:bg-foreground/20",
        isDragging && "opacity-80 scale-[1.02] z-50",
      )}
      style={{ left: `${left}%`, width: `${width}%`, minWidth: isMobile ? "60px" : undefined }}
      onMouseDown={(e) => handleMouseDown(e, "move")}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, clip.id); }}
    >
      {/* Left Trim Handle */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 cursor-ew-resize hover:bg-primary/50 rounded-l-md",
          isMobile ? "w-5" : "w-3",
        )}
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
        className={cn(
          "absolute right-0 top-0 bottom-0 cursor-ew-resize hover:bg-primary/50 rounded-r-md",
          isMobile ? "w-5" : "w-3",
        )}
        onMouseDown={(e) => handleMouseDown(e, "end")}
      />

      {/* Speed badge — shown when global playback speed is not 1× */}
      {playbackSpeed !== 100 && (
        <span className="absolute top-0.5 right-4 text-[7px] font-black text-amber-400/80 pointer-events-none">
          {(playbackSpeed / 100).toFixed(1)}×
        </span>
      )}

      {/* Color label dot */}
      {clip.colorLabel && (
        <span
          className="absolute bottom-0.5 left-1 w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{
            backgroundColor: {
              red: "#ef4444", blue: "#3b82f6", green: "#22c55e",
              yellow: "#f59e0b", purple: "#a855f7", orange: "#f97316",
            }[clip.colorLabel] ?? "transparent",
          }}
        />
      )}
    </div>
  );
}

// ---- Main BottomDock ----
export default function BottomDock() {
  const {
    transcript,
    suggestions,
    setSuggestions,
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
    waveformPeaks,
    silenceSegments,
    undoStack,
    redoStack,
    undo,
    redo,
    deleteClip,
    markIn,
    markOut,
    timelineMarkers,
    addTimelineMarker,
    videoElementRef,
  } = useEditorStore();

  const { activeTool, setActiveTool, timelineZoom, setTimelineZoom, snapLine } = useUIStore();
  const [detectingScenes, setDetectingScenes] = useState(false);
  const [detectingBeats, setDetectingBeats] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isCompact = useMediaQuery("(max-width: 480px)");

  const handlePinchZoom = useCallback((scale: number) => {
    setTimelineZoom(useUIStore.getState().timelineZoom * scale);
  }, [setTimelineZoom]);

  const hasShownPinchHintRef = useRef(false);
  useEffect(() => {
    if (!isMobile || duration === 0 || hasShownPinchHintRef.current) return;
    if (typeof localStorage !== "undefined" && localStorage.getItem(PINCH_HINT_KEY)) return;
    hasShownPinchHintRef.current = true;
    toast.info("Pinch the timeline to zoom in or out.", { duration: 4000 });
    try {
      localStorage.setItem(PINCH_HINT_KEY, "1");
    } catch {
      /* localStorage unavailable — hint just shows again next session */
    }
  }, [isMobile, duration]);

  const handleDetectScenes = useCallback(async () => {
    const video =
      videoElementRef?.current ??
      (document.querySelector("video") as HTMLVideoElement | null);
    if (!video) {
      toast.error("No video loaded — load a video first.");
      return;
    }
    setDetectingScenes(true);
    toast.info("Scene detection running…");
    try {
      const cuts = await detectScenes(video);
      if (cuts.length === 0) {
        toast.info("No scene cuts detected. Try a lower threshold.");
      } else {
        cuts.forEach((t) => addTimelineMarker(t, `Scene`, "yellow"));
        toast.success(`Found ${cuts.length} scene cut${cuts.length !== 1 ? "s" : ""}.`);
      }
    } catch {
      toast.error("Scene detection failed.");
    } finally {
      setDetectingScenes(false);
    }
  }, [videoElementRef, addTimelineMarker]);

  const handleDetectBeats = useCallback(async () => {
    const video =
      videoElementRef?.current ??
      (document.querySelector("video") as HTMLVideoElement | null);
    if (!video || !video.src) {
      toast.error("No video loaded — load a video first.");
      return;
    }
    setDetectingBeats(true);
    toast.info("Beat detection running…");
    try {
      const audioCtx = new AudioContext();
      const response = await fetch(video.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      const beats = await detectBeats(audioBuffer, { band: "bass", threshold: 0.65 });
      if (beats.length === 0) {
        toast.info("No beats detected. Try a different track.");
      } else {
        beats.forEach((t) => addTimelineMarker(t, "Beat", "purple"));
        toast.success(`Found ${beats.length} beat${beats.length !== 1 ? "s" : ""}.`);
      }
    } catch {
      toast.error("Beat detection failed.");
    } finally {
      setDetectingBeats(false);
    }
  }, [videoElementRef, addTimelineMarker]);

  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const isDraggingPlayhead = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ clipId: string; x: number; y: number } | null>(null);

  usePinchGesture(timelineScrollRef, { onPinch: handlePinchZoom, enabled: isMobile });

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [contextMenu]);

  const handleClipContextMenu = useCallback(
    (point: { clientX: number; clientY: number }, clipId: string) => {
      setContextMenu({ clipId, x: point.clientX, y: point.clientY });
    },
    [],
  );

  const handleOpenInspector = useCallback(() => {
    window.dispatchEvent(new CustomEvent("qai:mobile-inspector-open"));
  }, []);

  const duplicateClip = useCallback(
    (clipId: string) => {
      const clip = suggestions.find((c) => c.id === clipId);
      if (!clip) return;
      const clipLen = clip.end - clip.start;
      const newStart = clip.end;
      const newEnd = Math.min(newStart + clipLen, duration);
      if (newStart >= duration) {
        toast.error("No room to duplicate — move the clip earlier.");
        return;
      }
      const newClip: Clip = { ...clip, id: `${clip.id}-dup-${Date.now()}`, start: newStart, end: newEnd };
      setSuggestions([...suggestions, newClip]);
      toast.success("Clip duplicated.");
    },
    [suggestions, duration, setSuggestions],
  );

  // waveformPeaks come pre-computed from the store (set by useMediaPipeline after
  // audio extraction). The raw Float32Array is never stored in Zustand — peaks are
  // 120 numbers computed with O(1)-per-bar stride sampling before GC releases the
  // raw buffer. No useMemo needed here.

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
    toast.success(nextVal ? "AI Voiceover enabled." : "Voiceover disabled.");
  }, [exportSettings.voiceoverEnabled, setExportSetting]);

  const handleTimelineWheel = useCallback((e: React.WheelEvent) => {
    if (e.altKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setTimelineZoom(timelineZoom + delta);
    }
  }, [timelineZoom, setTimelineZoom]);

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
      <div className="flex items-center justify-between px-2 flex-wrap gap-y-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => undo()}
            title="Undo — Ctrl+Z"
            aria-label="Undo"
            disabled={undoStack.length === 0}
            className={cn(
              "undo-btn text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation",
              isMobile ? "h-12 w-12" : "h-8 w-8",
            )}
          >
            <Undo2 className={cn("undo-icon", isMobile ? "w-5 h-5" : "w-4 h-4")} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => redo()}
            title="Redo — Ctrl+Shift+Z"
            aria-label="Redo"
            disabled={redoStack.length === 0}
            className={cn(
              "redo-btn text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation",
              isMobile ? "h-12 w-12" : "h-8 w-8",
            )}
          >
            <Redo2 className={cn("redo-icon", isMobile ? "w-5 h-5" : "w-4 h-4")} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={isPlaying ? "Pause" : "Play"}
            className={cn(
              "text-foreground/60 hover:text-primary transition-colors touch-manipulation",
              isMobile ? "h-16 w-16" : "w-8 h-8",
            )}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className={cn("fill-current", isMobile ? "w-7 h-7" : "w-4 h-4")} aria-hidden="true" />
            ) : (
              <Play className={cn("fill-current", isMobile ? "w-7 h-7" : "w-4 h-4")} aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Stop"
            className={cn(
              "text-foreground/60 hover:text-primary transition-colors touch-manipulation",
              isMobile ? "h-12 w-12" : "w-8 h-8",
            )}
            onClick={stopPlayback}
          >
            <Square className={cn("fill-current", isMobile ? "w-5 h-5" : "w-3.5 h-3.5")} aria-hidden="true" />
          </Button>
          <span
            className={cn(
              "font-mono text-muted-foreground/60 tabular-nums select-none",
              isMobile ? "text-sm" : "text-[10px]",
            )}
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {isCompact ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="More tools"
                className="h-12 w-12 rounded-xl flex items-center justify-center text-foreground/60 hover:text-primary hover:bg-foreground/5 transition-colors touch-manipulation"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {tools.map(({ icon: Icon, label, toolId, action, tooltip }) => (
                <DropdownMenuItem
                  key={label}
                  title={tooltip}
                  onClick={() => { action(); setActiveTool(toolId); }}
                  className={cn(activeTool === toolId && "text-primary")}
                >
                  <Icon className="w-4 h-4 mr-2" aria-hidden="true" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
        <div className="flex items-center gap-5 flex-1 select-none">
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
                  "flex items-center gap-2 group cursor-pointer focus:outline-none transition-all duration-200 touch-manipulation",
                  isMobile && "py-2",
                  isActive && "relative"
                )}
              >
                {isActive && (
                  <span className="absolute -inset-x-2 -inset-y-1 rounded-lg bg-primary/10 border border-primary/20 pointer-events-none" />
                )}
                <Icon
                  className={cn(
                    "transition-colors relative",
                    isMobile ? "w-5 h-5" : "w-4 h-4",
                    isActive ? "text-primary" : "text-foreground/40 group-hover:text-primary"
                  )}
                  aria-hidden={true}
                />
                <span
                  className={cn(
                    "font-black uppercase tracking-widest transition-colors relative",
                    isMobile ? "text-[11px]" : "text-[10px]",
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
        )}
        {/* Detect Scenes */}
        <button
          onClick={handleDetectScenes}
          disabled={detectingScenes || duration === 0}
          title="Detect Scenes — auto-place markers at cut points"
          aria-label="Detect scenes"
          className={cn(
            "flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-colors ml-auto shrink-0",
            detectingScenes || duration === 0
              ? "border-border text-muted-foreground/30 cursor-not-allowed"
              : "border-yellow-500/30 text-yellow-400/70 hover:text-yellow-400 hover:border-yellow-500/60 hover:bg-yellow-500/8"
          )}
        >
          <ScanLine className={cn("w-3 h-3", detectingScenes && "animate-pulse")} />
          {detectingScenes ? "Detecting…" : "Scenes"}
        </button>

        {/* Detect Beats */}
        <button
          onClick={handleDetectBeats}
          disabled={detectingBeats || duration === 0}
          title="Detect Beats — place purple markers at bass hits"
          aria-label="Detect beats"
          className={cn(
            "flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-colors shrink-0",
            detectingBeats || duration === 0
              ? "border-border text-muted-foreground/30 cursor-not-allowed"
              : "border-purple-500/30 text-purple-400/70 hover:text-purple-400 hover:border-purple-500/60 hover:bg-purple-500/8"
          )}
        >
          <Music className={cn("w-3 h-3", detectingBeats && "animate-pulse")} />
          {detectingBeats ? "Detecting…" : "Beats"}
        </button>

        {/* Timeline zoom controls */}
        <div className="flex items-center gap-1.5 shrink-0 select-none">
          <button
            onClick={() => setTimelineZoom(timelineZoom - 0.25)}
            className={cn(
              "rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors touch-manipulation",
              isMobile ? "w-9 h-9" : "w-6 h-6",
            )}
            title="Zoom Out"
            aria-label="Timeline zoom out"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[9px] font-black text-muted-foreground tabular-nums w-8 text-center">
            {Math.round(timelineZoom * 100)}%
          </span>
          <button
            onClick={() => setTimelineZoom(timelineZoom + 0.25)}
            className={cn(
              "rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors touch-manipulation",
              isMobile ? "w-9 h-9" : "w-6 h-6",
            )}
            title="Zoom In"
            aria-label="Timeline zoom in"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => setTimelineZoom(1)}
            className={cn(
              "rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors touch-manipulation",
              isMobile ? "w-9 h-9" : "w-6 h-6",
            )}
            title="Fit (100%)"
            aria-label="Reset timeline zoom"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
        {/* V3 / V2 lanes — render only when populated */}
        <MultiTrackTimeline />
        <TimeScale duration={duration} />

        {/* Video Track Area — scrollable when zoomed */}
        <div
          ref={timelineScrollRef}
          onWheel={handleTimelineWheel}
          className={cn(
            "flex gap-4 items-center group overflow-x-auto overflow-y-hidden",
            isMobile && "touch-pan-x",
          )}
        >
          <span className="w-16 text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest text-right shrink-0">
            Video
          </span>
          <div style={{ width: `${timelineZoom * 100}%`, minWidth: "100%", position: "relative" }}>
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
            className={cn(
              "w-full rounded-lg bg-foreground/5 border border-foreground/5 relative overflow-visible cursor-crosshair",
              isMobile ? "h-12" : "h-8",
            )}
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
                  isMobile={isMobile}
                  onSelect={() => selectClip(clip.id)}
                  onContextMenu={handleClipContextMenu}
                  onOpenInspector={handleOpenInspector}
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
                className="absolute top-[-30px] bottom-[-10px] w-0.5 z-30 pointer-events-none"
                style={{ left: `${playheadPct}%` }}
              >
                {/* Glow line */}
                <div className="absolute inset-0 w-px bg-primary shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                {/* Head triangle / thumb grip */}
                {isMobile ? (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary border-2 border-white/80 shadow-[0_0_8px_rgba(168,85,247,0.7)]" />
                ) : (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-primary drop-shadow-[0_0_4px_rgba(168,85,247,0.6)]" />
                )}
              </div>
            )}

            {/* In/Out range highlight */}
            {markIn !== null && markOut !== null && duration > 0 && markOut > markIn && (
              <div
                className="absolute top-0 bottom-0 bg-purple-500/15 border-x border-purple-500/40 pointer-events-none z-10"
                style={{
                  left: `${(markIn / duration) * 100}%`,
                  width: `${((markOut - markIn) / duration) * 100}%`,
                }}
              />
            )}
            {/* Mark-in line */}
            {markIn !== null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-purple-400 z-20 pointer-events-none"
                style={{ left: `${(markIn / duration) * 100}%` }}
                title={`Mark In: ${formatTime(markIn)}`}
              >
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-purple-400" />
              </div>
            )}
            {/* Mark-out line */}
            {markOut !== null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-purple-400 z-20 pointer-events-none"
                style={{ left: `${(markOut / duration) * 100}%` }}
                title={`Mark Out: ${formatTime(markOut)}`}
              >
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-purple-400" />
              </div>
            )}

            {/* Timeline markers — colored diamonds, click to seek */}
            {duration > 0 && timelineMarkers.map((marker) => (
              <button
                key={marker.id}
                className="absolute top-0 z-25 -translate-x-1/2 flex flex-col items-center pointer-events-auto focus:outline-none"
                style={{ left: `${(marker.time / duration) * 100}%` }}
                title={marker.label ? `${marker.label} — ${formatTime(marker.time)}` : formatTime(marker.time)}
                aria-label={marker.label ? `Seek to ${marker.label} at ${formatTime(marker.time)}` : `Seek to ${formatTime(marker.time)}`}
                onClick={(e) => { e.stopPropagation(); setPendingSeek(marker.time); }}
              >
                <div
                  className="w-2.5 h-2.5 rotate-45 border border-current"
                  style={{ color: marker.color === "purple" ? "#a855f7" : marker.color === "red" ? "#ef4444" : marker.color === "green" ? "#22c55e" : marker.color === "blue" ? "#3b82f6" : "#f59e0b" }}
                />
              </button>
            ))}

            {/* Magnetic snap line */}
            {snapLine !== null && duration > 0 && (
              <div
                className="absolute top-[-30px] bottom-[-10px] w-px bg-yellow-400/80 z-30 pointer-events-none shadow-[0_0_6px_rgba(250,204,21,0.5)]"
                style={{ left: `${(snapLine / duration) * 100}%` }}
              />
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
        </div>

        {/* Audio Track */}
        <div className="flex gap-4 items-center group">
          <span className="w-16 text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest text-right shrink-0">
            Audio
          </span>
          <div className={cn("flex-1 rounded-lg bg-foreground/5 border border-foreground/5 relative overflow-hidden", isMobile ? "h-10" : "h-7")}>
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
      {/* Right-click / long-press context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-xl shadow-2xl py-1 min-w-[148px] overflow-hidden"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 160),
            left: Math.min(contextMenu.x, window.innerWidth - 160),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {[
            {
              label: "Trim",
              sub: "Drag clip edges",
              onClick: () => { toast.info("Drag the clip edges on the timeline to trim."); setContextMenu(null); },
            },
            {
              label: "Duplicate",
              onClick: () => { duplicateClip(contextMenu.clipId); setContextMenu(null); },
            },
            {
              label: "Delete",
              danger: true,
              onClick: () => { deleteClip(contextMenu.clipId); toast.success("Clip deleted."); setContextMenu(null); },
            },
          ].map(({ label, sub, danger, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className={cn(
                "w-full text-left px-3 font-bold flex items-center justify-between hover:bg-foreground/8 transition-colors touch-manipulation",
                isMobile ? "py-3 text-[12px]" : "py-2 text-[11px]",
                danger ? "text-red-400 hover:bg-red-500/10" : "text-foreground/80",
              )}
            >
              <span>{label}</span>
              {sub && <span className="text-[9px] text-muted-foreground/50 font-normal">{sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeScale({ duration }: { duration: number }) {
  if (duration === 0) return <div className="h-4 pl-20" />;

  // Pick a marker interval that keeps the ruler readable (≤ 10 marks).
  const step = duration <= 60 ? 10 : duration <= 300 ? 30 : duration <= 1800 ? 60 : 300;
  const markers: number[] = [];
  for (let t = 0; t <= duration; t += step) markers.push(t);

  return (
    <div className="h-4 flex items-center">
      {/* Spacer matching the "Video" label width + gap */}
      <div className="w-16 shrink-0 mr-4" />
      {/* Ruler track — absolutely positioned markers proportional to the track */}
      <div className="flex-1 relative h-full mr-4">
        {markers.map((t) => (
          <span
            key={t}
            className="absolute top-0 -translate-x-1/2 text-[8px] font-black text-muted-foreground/30 uppercase tracking-[0.25em] select-none"
            style={{ left: `${(t / duration) * 100}%` }}
          >
            {formatTime(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
