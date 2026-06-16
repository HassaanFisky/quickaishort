"use client";

import { X } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { formatTime } from "@/lib/utils/formatTime";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import type { BRollElement, VideoOverlayElement } from "@/stores/editorStore";

interface TrackLaneProps {
  label: string;
  colorClass: string;
  elements: (BRollElement | VideoOverlayElement)[];
  duration: number;
  onRemove: (id: string) => void;
  onLabelClick?: () => void;
  isMobile: boolean;
}

function TrackLane({
  label,
  colorClass,
  elements,
  duration,
  onRemove,
  onLabelClick,
  isMobile,
}: TrackLaneProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onLabelClick}
        disabled={!onLabelClick}
        className="w-16 shrink-0 text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 text-right hover:text-muted-foreground disabled:cursor-default transition-colors"
      >
        {label}
      </button>
      <div
        className={cn(
          "flex-1 relative bg-foreground/5 rounded-lg border border-foreground/5",
          isMobile ? "h-12" : "h-7",
        )}
      >
        {elements.map((el) => {
          const leftPct = duration > 0 ? (el.start_sec / duration) * 100 : 0;
          const widthPct = duration > 0 ? (el.duration_sec / duration) * 100 : 0;
          const title = "title" in el ? el.title : "Overlay";
          return (
            <div
              key={el.id}
              className={`absolute top-0.5 bottom-0.5 ${colorClass} border rounded flex items-center px-1 group transition-colors cursor-default`}
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.8)}%` }}
              role="group"
              aria-label={`${label} clip: ${title || "clip"} at ${formatTime(el.start_sec)}, ${formatTime(el.duration_sec)} long`}
            >
              <span className="truncate flex-1 text-[9px] text-white font-medium pointer-events-none">
                {title}
              </span>
              <button
                onClick={() => onRemove(el.id)}
                aria-label={`Remove ${title || label} clip`}
                className={cn(
                  "ml-0.5 rounded hover:bg-black/30 transition-opacity shrink-0",
                  isMobile ? "p-1.5 opacity-70" : "p-0.5 opacity-0 group-hover:opacity-100",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Delete" || e.key === "Backspace") {
                    e.preventDefault();
                    onRemove(el.id);
                  }
                }}
              >
                <X className={isMobile ? "w-3.5 h-3.5" : "w-2.5 h-2.5"} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MultiTrackTimeline() {
  const elements = useEditorStore((s) => s.elements);
  const removeElement = useEditorStore((s) => s.removeElement);
  const duration = useEditorStore((s) => s.duration);
  const setBRollDrawerOpen = useEditorStore((s) => s.setBRollDrawerOpen);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const brollElements = elements.filter(
    (e): e is BRollElement => e.type === "BROLL",
  );
  const overlayElements = elements.filter(
    (e): e is VideoOverlayElement => e.type === "VIDEO_OVERLAY",
  );

  if (brollElements.length === 0 && overlayElements.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {brollElements.length > 0 && (
        <TrackLane
          label="B-ROLL"
          colorClass="bg-violet-500/30 border-violet-500/60 hover:bg-violet-500/40"
          elements={brollElements}
          duration={duration}
          onRemove={removeElement}
          onLabelClick={() => setBRollDrawerOpen(true)}
          isMobile={isMobile}
        />
      )}
      {overlayElements.length > 0 && (
        <TrackLane
          label="OVERLAY"
          colorClass="bg-primary/30 border-primary/60 hover:bg-primary/40"
          elements={overlayElements}
          duration={duration}
          onRemove={removeElement}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
