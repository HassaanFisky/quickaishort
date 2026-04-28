"use client";

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
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function BottomDock() {
  const {
    transcript,
    suggestions,
    duration,
    currentTime,
    isPlaying,
    setIsPlaying,
    setCurrentTime,
    selectedClipId,
    selectClip,
  } = useEditorStore();

  const [visualizerHeights] = useState<number[]>(() =>
    Array.from({ length: 60 }, () => 10 + Math.random() * 60),
  );

  const stopPlayback = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full h-full flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500">
      {/* Controls Row */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-foreground/60 hover:text-primary transition-colors"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-foreground/60 hover:text-primary transition-colors"
            onClick={stopPlayback}
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </Button>
          <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-6">
          {[
            { icon: SquareSplitHorizontal, label: "Split" },
            { icon: Scissors, label: "Trim" },
            { icon: Type, label: "Text" },
            { icon: Wand2, label: "FX" },
            { icon: Layout, label: "Transitions" },
            { icon: Mic, label: "Voiceover" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 group cursor-pointer">
              <Icon className="w-4 h-4 text-foreground/40 group-hover:text-primary transition-colors" />
              <span className="text-[10px] font-black text-foreground/40 uppercase tracking-widest group-hover:text-primary transition-colors">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-Track Timeline */}
      <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
        <TimeScale duration={duration} />

        {/* Video Track */}
        <div className="flex gap-4 items-center group">
          <span className="w-16 text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest text-right">
            Video
          </span>
          <div className="flex-1 h-7 rounded-lg bg-foreground/5 border border-foreground/5 relative overflow-hidden">
            {duration > 0 && suggestions.length > 0 ? (
              suggestions.map((clip) => {
                const left = ((clip.start / duration) * 100).toFixed(2);
                const width = (((clip.end - clip.start) / duration) * 100).toFixed(2);
                const isSelected = clip.id === selectedClipId;
                return (
                  <button
                    key={clip.id}
                    onClick={() => selectClip(clip.id)}
                    className={cn(
                      "absolute top-0.5 bottom-0.5 rounded-md flex items-center px-2 transition-all",
                      isSelected
                        ? "bg-gradient-to-r from-primary/40 to-primary/20 border border-primary/60 shadow-[0_0_15px_hsl(var(--primary)/0.2)]"
                        : "bg-foreground/5 border border-foreground/10 hover:bg-foreground/10",
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`Clip ${clip.start.toFixed(1)}s – ${clip.end.toFixed(1)}s`}
                  >
                    <span className={cn("text-[8px] font-bold truncate uppercase", isSelected ? "text-primary" : "text-muted-foreground")}>
                      {clip.start.toFixed(0)}s
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-[8px] text-muted-foreground/30 uppercase tracking-widest">
                  {duration === 0 ? "No video loaded" : "No clips yet"}
                </span>
              </div>
            )}

            {/* Playhead */}
            {duration > 0 && (
              <div
                className="absolute top-[-30px] bottom-[-8px] w-0.5 bg-foreground z-20 pointer-events-none"
                style={{ left: `${playheadPct}%` }}
              >
                <div className="absolute -top-1 -left-[3px] w-2 h-2 bg-foreground rotate-45 shadow-[0_0_10px_hsl(var(--foreground)/0.5)]" />
              </div>
            )}
          </div>
        </div>

        {/* Audio Track */}
        <div className="flex gap-4 items-center group">
          <span className="w-16 text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest text-right">
            Audio
          </span>
          <div className="flex-1 h-7 rounded-lg bg-foreground/5 border border-foreground/5 relative flex gap-1 p-0.5">
            {transcript ? (
              <div className="flex-1 h-full bg-emerald-500/10 border border-emerald-500/20 rounded-md flex items-center px-2 gap-1 overflow-hidden">
                <span className="text-[8px] font-bold text-emerald-400 truncate uppercase">
                  Transcript
                </span>
                <div className="flex items-center gap-0.5 h-3 flex-1 overflow-hidden">
                  {visualizerHeights.slice(0, 20).map((h, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-emerald-400/40 rounded-full flex-shrink-0"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center flex-1 h-full">
                <span className="text-[8px] text-muted-foreground/30 uppercase tracking-widest">
                  No audio
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Text / Captions Track */}
        <div className="flex gap-4 items-center group">
          <span className="w-16 text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest text-right">
            Text
          </span>
          <div className="flex-1 h-7 rounded-lg bg-foreground/5 border border-foreground/5 relative flex gap-1 p-0.5">
            {transcript?.chunks && transcript.chunks.length > 0 ? (
              <div className="w-32 h-full bg-primary/10 border border-primary/20 rounded-md flex items-center px-2">
                <span className="text-[8px] font-bold text-primary truncate uppercase">
                  {transcript.chunks.length} captions
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center flex-1 h-full">
                <span className="text-[8px] text-muted-foreground/30 uppercase tracking-widest">
                  No captions
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
  if (duration === 0) {
    return (
      <div className="flex items-center h-4 px-[100px] gap-[100px] text-[8px] font-black text-muted-foreground/30 uppercase tracking-[0.3em]">
        <span>0:00</span>
        <span>0:10</span>
        <span>0:20</span>
        <span>0:30</span>
      </div>
    );
  }

  const markers = [0, 0.25, 0.5, 0.75].map((frac) => frac * duration);
  return (
    <div className="flex items-center h-4 pl-[100px] pr-4 justify-between text-[8px] font-black text-muted-foreground/30 uppercase tracking-[0.3em]">
      {markers.map((t) => (
        <span key={t}>{formatTime(t)}</span>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TimeScale({ duration }: { duration: number }) {
  if (duration === 0) {
    return (
      <div className="flex items-center h-4 px-[100px] gap-[100px] text-[8px] font-black text-muted-foreground/30 uppercase tracking-[0.3em]">
        <span>0:00</span>
        <span>0:10</span>
        <span>0:20</span>
        <span>0:30</span>
      </div>
    );
  }

  // Generate 4 evenly spaced time markers
  const markers = [0, 0.25, 0.5, 0.75].map((frac) => frac * duration);
  return (
    <div className="flex items-center h-4 pl-[100px] pr-4 justify-between text-[8px] font-black text-muted-foreground/30 uppercase tracking-[0.3em]">
      {markers.map((t) => (
        <span key={t}>{formatTime(t)}</span>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
