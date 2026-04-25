"use client";

import React from "react";
import { useTimelineStore } from "@/lib/editor/timeline-state";

interface PlayheadProps {
  pps: number;
}

export function Playhead({ pps }: PlayheadProps) {
  const { currentTime } = useTimelineStore();

  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
      style={{ left: `${currentTime * pps}px` }}
    >
      <div className="absolute top-0 -left-1.5 w-3 h-3 bg-red-500 rounded-b-full shadow-lg" />
      <div className="absolute -top-6 -left-8 w-16 text-center text-[10px] font-mono text-red-500 bg-black/50 rounded px-1">
        {currentTime.toFixed(2)}s
      </div>
    </div>
  );
}
