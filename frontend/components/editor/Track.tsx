"use client";

import React from "react";
import { Clip as ClipType } from "@/lib/editor/timeline-state";
import { TimelineClip } from "./TimelineClip";

interface TrackProps {
  id: number;
  pps: number;
  clips: ClipType[];
}

export function Track({ id, pps, clips }: TrackProps) {
  return (
    <div className="relative h-20 bg-neutral-800/20 border-b border-neutral-800/50 w-full group">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-neutral-900 border-r border-neutral-800 flex items-center justify-center z-10 opacity-50 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-bold text-neutral-500 uppercase">
          T{id}
        </span>
      </div>

      {clips.map((clip) => (
        <TimelineClip key={clip.id} clip={clip} pps={pps} />
      ))}
    </div>
  );
}
