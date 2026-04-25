"use client";

import React, { useState } from "react";
import {
  useTimelineStore,
  Clip as ClipType,
} from "@/lib/editor/timeline-state";
import { cn } from "@/lib/utils";

interface TimelineClipProps {
  clip: ClipType;
  pps: number;
}

export function TimelineClip({ clip, pps }: TimelineClipProps) {
  const { updateClip, selectedClipId, pushHistory, snapToGrid, snapInterval } =
    useTimelineStore();
  const [isDragging, setIsDragging] = useState(false);
  const isSelected = selectedClipId === clip.id;

  const clipWidth = (clip.endTime - clip.startTime) * pps;
  const clipLeft = clip.startTime * pps;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    useTimelineStore.setState({ selectedClipId: clip.id });

    const startX = e.clientX;
    const initialStartTime = clip.startTime;
    const duration = clip.endTime - clip.startTime;

    const handleMouseMove = (mmE: MouseEvent) => {
      const deltaX = mmE.clientX - startX;
      let newStartTime = initialStartTime + deltaX / pps;

      if (snapToGrid) {
        newStartTime = Math.round(newStartTime / snapInterval) * snapInterval;
      }

      newStartTime = Math.max(0, newStartTime);

      updateClip(clip.id, {
        startTime: newStartTime,
        endTime: newStartTime + duration,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      pushHistory();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleTrim = (side: "left" | "right", e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;

    const handleMouseMove = (mmE: MouseEvent) => {
      const deltaX = mmE.clientX - startX;
      let newTime =
        (side === "left" ? clip.startTime : clip.endTime) + deltaX / pps;

      if (snapToGrid) {
        newTime = Math.round(newTime / snapInterval) * snapInterval;
      }

      if (side === "left") {
        const cappedTime = Math.min(newTime, clip.endTime - 0.1);
        const timeDiff = cappedTime - clip.startTime;
        updateClip(clip.id, {
          startTime: cappedTime,
          trimIn: clip.trimIn + timeDiff,
        });
      } else {
        const cappedTime = Math.max(newTime, clip.startTime + 0.1);
        const timeDiff = cappedTime - clip.endTime;
        updateClip(clip.id, {
          endTime: cappedTime,
          trimOut: clip.trimOut + timeDiff,
        });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      pushHistory();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 bg-blue-600/80 border border-blue-400/60 rounded-md cursor-grab active:cursor-grabbing group overflow-hidden transition-[border,box-shadow]",
        isSelected && "border-white ring-2 ring-blue-500/50 z-10",
        isDragging && "opacity-80",
      )}
      style={{
        left: `${clipLeft}px`,
        width: `${Math.max(clipWidth, 4)}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-ew-resize z-20"
        onMouseDown={(e) => handleTrim("left", e)}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-ew-resize z-20"
        onMouseDown={(e) => handleTrim("right", e)}
      />

      <div className="flex flex-col p-1 h-full pointer-events-none">
        <span className="text-[10px] font-bold truncate text-white/90">
          {clip.id.substring(0, 12)}
        </span>
        <span className="text-[8px] text-white/50">
          {(clip.endTime - clip.startTime).toFixed(2)}s
        </span>
      </div>

      {isSelected && (
        <div className="absolute top-0 right-0 left-0 h-0.5 bg-white/50" />
      )}
    </div>
  );
}
