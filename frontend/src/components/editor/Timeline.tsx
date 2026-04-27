"use client";

import { useMemo } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

export default function Timeline() {
  const { audioData, silenceSegments, duration } = useEditorStore();
  const numBars = 120; // Matches visually with the design

  // Generate waveform levels from actual audio data or fallback to random
  const waveLevels = useMemo(() => {
    if (!audioData) {
      // Fallback for when no audio is analyzed yet - use index-based stable pattern
      return Array.from({ length: numBars }).map(
        (_, i) => 0.2 + ((i * 17) % 30) / 100,
      );
    }

    const levels: number[] = [];
    const step = Math.floor(audioData.length / numBars);

    for (let i = 0; i < numBars; i++) {
      const start = i * step;
      const end = start + step;
      let sum = 0;
      // Optimize: only check every Nth sample for speed
      const stride = Math.ceil((end - start) / 50);
      let count = 0;

      for (let j = start; j < end; j += stride) {
        sum += Math.abs(audioData[j]);
        count++;
      }
      // Normalize somewhat
      levels.push(Math.min(1, (sum / count) * 3));
    }
    return levels;
  }, [audioData]);

  return (
    <div className="flex-1 p-4 flex flex-col gap-4 bg-muted/20">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
        <div className="flex gap-4">
          <span>00:00:00</span>
          <span className="text-primary/40">In: 00:00:00</span>
        </div>
        <div className="flex gap-2">
          <Badge
            variant="outline"
            className="font-mono text-[10px] bg-background"
          >
            9:16
          </Badge>
          <Badge
            variant="outline"
            className="font-mono text-[10px] bg-background"
          >
            30.00 FPS
          </Badge>
        </div>
        <div className="flex gap-4">
          <span className="text-primary/40">Out: {formatTime(duration)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="relative h-24 bg-muted/20 rounded-xl border-2 border-dashed border-muted-foreground/10 overflow-hidden flex items-center px-4 group transition-colors hover:bg-muted/30">
        {/* Silence Segments Overlay */}
        {silenceSegments.map((seg, i) => {
          const startPct = (seg.start / duration) * 100;
          const widthPct = ((seg.end - seg.start) / duration) * 100;
          if (seg.type === "silence") {
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 bg-red-500/20 border-x border-red-500/30 z-0 pointer-events-none"
                style={{ left: `${startPct}%`, width: `${widthPct}%` }}
              >
                <div className="absolute top-2 left-1 text-[8px] text-red-500 font-mono font-bold uppercase rotate-90 origin-top-left opacity-70">
                  Silence
                </div>
              </div>
            );
          }
          return null;
        })}

        <div className="absolute inset-x-4 inset-y-2 flex items-center justify-between gap-0.5 opacity-80 pointer-events-none z-10">
          {waveLevels.map((level, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-300 ${audioData ? "bg-primary" : "bg-primary/20"}`}
              style={{ height: `${Math.max(10, level * 100)}%` }}
            />
          ))}
        </div>

        {/* Playhead */}
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground shadow-[0_0_10px_currentColor] z-20 translate-x-0 transition-transform will-change-transform" />

        <Slider
          defaultValue={[0, 100]}
          max={100}
          step={1}
          className="relative z-30 opacity-50 hover:opacity-100 transition-opacity"
        />
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
