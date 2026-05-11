"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { Button } from "@/components/ui/button";
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
  clip: any;
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
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/50 rounded-l-md"
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
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/50 rounded-r-md"
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
    setIsPlaying,
    setCurrentTime,
    setPendingSeek,
    selectedClipId,
    selectClip,
    splitClipAtTime,
    addCanvasElement,
    setExportSetting,
    exportSettings,
  } = useEditorStore();

  const [visualizerHeights] = useState<number[]>(() =>
    Array.from({ length: 60 }, () => 10 + Math.random() * 60),
  );

  const stopPlayback = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setPendingSeek(0);
  };

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const videoTrackRef = useRef<HTMLDivElement>(null);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!videoTrackRef.current || duration === 0) return;
      const rect = videoTrackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setPendingSeek(pct * duration);
    },
    [duration, setPendingSeek],
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

  const handleFX = useCallback(() => {
    const filters = ["None", "Urban", "Retro", "Cinematic"] as const;
    const currentIdx = filters.indexOf(exportSettings.filter as any);
    const nextFilter = filters[(currentIdx + 1) % filters.length];
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

  const tools = [
    { icon: SquareSplitHorizontal, label: "Split", action: handleSplit },
    { icon: Scissors, label: "Trim", action: () => toast.info("Drag the edges of clips on the timeline to trim.") },
    { icon: Type, label: "Text", action: handleAddText },
    { icon: Wand2, label: "FX", action: handleFX },
    { icon: Layout, label: "Transitions", action: handleTransitions },
    { icon: Mic, label: "Voiceover", action: handleVoiceover },
  ] as const;

  return (
    <div className="w-full h-full flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-foreground/60 hover:text-primary transition-colors"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-foreground/60 hover:text-primary transition-colors"
            onClick={stopPlayback}
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </Button>
          <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums select-none">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-5">
          {tools.map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex items-center gap-2 group cursor-pointer focus:outline-none"
            >
              <Icon className="w-4 h-4 text-foreground/40 group-hover:text-primary transition-colors" />
              <span className="text-[10px] font-black text-foreground/40 uppercase tracking-widest group-hover:text-primary transition-colors">
                {label}
              </span>
            </button>
          ))}
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
            onClick={handleTrackClick}
            className="flex-1 h-8 rounded-lg bg-foreground/5 border border-foreground/5 relative overflow-hidden cursor-crosshair"
          >
            {duration > 0 && suggestions.length > 0 ? (
              suggestions.map((clip: any) => (
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

            {/* Playhead */}
            {duration > 0 && (
              <div
                className="absolute top-[-30px] bottom-[-10px] w-0.5 bg-foreground z-30 pointer-events-none"
                style={{ left: `${playheadPct}%` }}
              >
                <div className="absolute -top-1 -left-[3px] w-2 h-2 bg-foreground rotate-45 shadow-[0_0_10px_white/30]" />
              </div>
            )}
          </div>
        </div>

        {/* Audio Track */}
        <div className="flex gap-4 items-center group">
          <span className="w-16 text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest text-right shrink-0">
            Audio
          </span>
          <div className="flex-1 h-7 rounded-lg bg-foreground/5 border border-foreground/5 relative flex gap-1 p-0.5">
            {transcript ? (
              <div className="flex-1 h-full bg-emerald-500/10 border border-emerald-500/20 rounded-md flex items-center px-2 gap-1 overflow-hidden">
                <span className="text-[8px] font-bold text-emerald-400 truncate uppercase">Transcript</span>
                <div className="flex items-center gap-0.5 h-3 flex-1 overflow-hidden">
                  {visualizerHeights.slice(0, 20).map((h, i) => (
                    <div key={i} className="w-0.5 bg-emerald-400/40 rounded-full shrink-0" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center flex-1 h-full">
                <span className="text-[8px] text-muted-foreground/30 uppercase tracking-widest">No audio</span>
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
