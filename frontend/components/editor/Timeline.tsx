"use client";

import React, { useRef } from "react";
import { useTimelineStore } from "@/lib/editor/timeline-state";
import { Track } from "./Track";
import { TimeRuler } from "./TimeRuler";
import { Playhead } from "./Playhead";

export function Timeline() {
  const { zoom, clips, currentTime, duration, setZoom, setCurrentTime } =
    useTimelineStore();
  const timelineRef = useRef<HTMLDivElement>(null);

  const pps = (zoom / 100) * 50;
  const totalWidth = Math.max(duration * pps, 2000);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const newTime = x / pps;
    setCurrentTime(Math.max(0, Math.min(newTime, duration)));
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.shiftKey && timelineRef.current) {
      timelineRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-neutral-900 border-t border-neutral-800"
      onWheel={handleWheel}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-neutral-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-600">10%</span>
          <input
            type="range"
            min="10"
            max="400"
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="w-32 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-[10px] text-neutral-500 w-10 text-right">
            {zoom}%
          </span>
        </div>
      </div>

      <div
        ref={timelineRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative select-none"
        onClick={handleTimelineClick}
      >
        <div
          className="relative min-h-full"
          style={{ width: `${totalWidth}px` }}
        >
          <TimeRuler pps={pps} duration={duration} />

          <div className="flex flex-col py-2 gap-1 min-h-[300px]">
            {[1, 2, 3, 4].map((trackNum) => (
              <Track
                key={trackNum}
                id={trackNum}
                pps={pps}
                clips={clips.filter((c) => c.track === trackNum)}
              />
            ))}
          </div>

          <Playhead pps={pps} />
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}
