"use client";

import { useRef, useCallback, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";
import { Scissors } from "lucide-react";
import { toast } from "sonner";
import { formatTime } from "@/lib/utils/formatTime";

interface SelRange {
  selStart: number;
  selEnd: number;
}

export default function TranscriptEditor() {
  const transcript = useEditorStore((s) => s.transcript);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setPendingSeek = useEditorStore((s) => s.setPendingSeek);
  const splitClipAtTime = useEditorStore((s) => s.splitClipAtTime);
  const rippleDelete = useEditorStore((s) => s.rippleDelete);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selRange, setSelRange] = useState<SelRange | null>(null);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) {
      setSelRange(null);
      return;
    }

    // Walk the selection to find all data-start spans
    const range = sel.getRangeAt(0);
    const spans = containerRef.current.querySelectorAll<HTMLSpanElement>("span[data-start]");

    let selStart: number | null = null;
    let selEnd: number | null = null;

    for (const span of spans) {
      if (range.intersectsNode(span)) {
        const s = parseFloat(span.dataset.start ?? "");
        const e = parseFloat(span.dataset.end ?? "");
        if (!isNaN(s) && (selStart === null || s < selStart)) selStart = s;
        if (!isNaN(e) && (selEnd === null || e > selEnd)) selEnd = e;
      }
    }

    if (selStart !== null && selEnd !== null && selEnd > selStart) {
      setSelRange({ selStart, selEnd });
    } else {
      setSelRange(null);
    }
  }, []);

  const handleDeleteSelection = useCallback(() => {
    if (!selRange) return;
    const { selStart, selEnd } = selRange;

    // Split at start boundary, then at end boundary, then ripple-delete middle
    splitClipAtTime(selStart);
    splitClipAtTime(selEnd);

    // Get fresh suggestions after both splits
    const { suggestions } = useEditorStore.getState();
    const clipsToDelete = suggestions.filter(
      (c) => c.start >= selStart && c.end <= selEnd + 0.01
    );
    clipsToDelete.forEach((c) => rippleDelete(c.id));

    toast.success(
      `Deleted ${formatTime(selStart)} – ${formatTime(selEnd)} and closed gap.`
    );
    setSelRange(null);
    window.getSelection()?.removeAllRanges();
  }, [selRange, splitClipAtTime, rippleDelete]);

  if (!transcript?.chunks?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-center p-6 gap-3">
        <Scissors className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed max-w-[180px]">
          Transcribe a video to edit by selecting text
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Action bar — appears on text selection */}
      <div
        className={cn(
          "px-3 py-2 border-b border-border flex items-center justify-between gap-2 transition-all duration-200",
          selRange ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
          {selRange
            ? `${formatTime(selRange.selStart)} – ${formatTime(selRange.selEnd)}`
            : ""}
        </span>
        <button
          onClick={handleDeleteSelection}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[9px] font-black text-red-400 uppercase tracking-widest hover:bg-red-500/20 transition-colors"
        >
          <Scissors className="w-3 h-3" />
          Delete & Close Gap
        </button>
      </div>

      {/* Transcript text */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="p-4 overflow-y-auto text-[12px] leading-relaxed text-foreground/80 select-text cursor-text"
        style={{ maxHeight: "380px" }}
      >
        {transcript.chunks.map((chunk, i) => {
          const isActive =
            currentTime >= chunk.start && currentTime < chunk.end;
          return (
            <span
              key={i}
              data-start={chunk.start}
              data-end={chunk.end}
              onClick={() => setPendingSeek(chunk.start)}
              className={cn(
                "rounded px-0.5 transition-colors duration-100 cursor-pointer",
                isActive
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-foreground/8"
              )}
            >
              {chunk.text}{" "}
            </span>
          );
        })}
      </div>

      <p className="px-4 pb-3 text-[9px] text-muted-foreground/40 italic">
        Click any word to seek · Select text then Delete & Close Gap to ripple-cut
      </p>
    </div>
  );
}
