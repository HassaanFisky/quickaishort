"use client";

import { useEditorStore } from "@/stores/editorStore";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Clock, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function DraggableClip({
  clip,
  isSelected,
  onClick,
}: {
  clip: {
    id: string;
    start: number;
    end: number;
    confidence: number;
    reason: string;
    score?: number;
    title?: string;
    description?: string;
    hook?: string;
    viralReasoning?: string;
    suggestedCaptions?: string[];
  };
  isSelected: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group relative p-4 rounded-2xl cursor-grab active:cursor-grabbing interactive-scale",
        isSelected
          ? "liquid-glass ring-1 ring-primary/40 elevation-2"
          : "bg-card/60 ghost-border hover:bg-card/80",
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <Badge
          className={cn(
            "font-medium text-[10px] px-2 py-0.5",
            (clip.score ?? clip.confidence) >= 90
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
              : "bg-primary/15 text-primary border-primary/20",
          )}
        >
          Score: {clip.score ?? clip.confidence}
        </Badge>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {Math.round(clip.end - clip.start)}s
        </span>
      </div>

      <h4 className="font-semibold text-sm text-foreground mb-1 group-hover:text-primary interactive">
        {clip.title || `Clip ${clip.id.split("-")[1]}`}
      </h4>
      <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
        {clip.hook ?? clip.reason}
      </p>

      {/* Viral Insight Section */}
      {clip.viralReasoning && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-2 mt-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-tighter">
              Viral Insight
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-foreground/70 font-medium italic">
            "{clip.viralReasoning}"
          </p>
          {clip.suggestedCaptions && clip.suggestedCaptions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {clip.suggestedCaptions.map((cap, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded-md bg-primary/20 text-primary text-[8px] font-bold"
                >
                  {cap}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {isSelected && (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2">
          <div className="w-0.5 h-6 bg-primary rounded-full" />
        </div>
      )}
    </div>
  );
}

export default function LeftPanel() {
  const { suggestions, selectedClipId, selectClip, sourceFile, currentStage } =
    useEditorStore();
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="w-full h-[70vh] flex flex-col gap-5 animate-in slide-in-from-left-4 duration-500">
      {/* Source Info */}
      {sourceFile && (
        <div className="liquid-glass p-4 rounded-2xl flex gap-4 items-center elevation-1">
          <div className="w-12 h-8 bg-muted/50 rounded-lg overflow-hidden relative flex items-center justify-center">
            <Film className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[10px] font-semibold text-muted-foreground truncate uppercase tracking-widest mb-0.5">
              Source
            </h3>
            <p className="text-sm font-medium truncate text-foreground">
              {sourceFile.name}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          AI Suggestions
        </span>
        {hasSuggestions && (
          <Badge
            variant="secondary"
            className="bg-primary/10 text-primary hover:bg-primary/15 interactive text-[10px]"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            {suggestions.length} Clips
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1 -mr-3 pr-3">
        {hasSuggestions ? (
          <DndContext collisionDetection={closestCenter}>
            <SortableContext
              items={suggestions}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {suggestions.map((clip) => (
                  <DraggableClip
                    key={clip.id}
                    clip={clip}
                    isSelected={selectedClipId === clip.id}
                    onClick={() => selectClip(clip.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground border border-dashed ghost-border rounded-2xl bg-card/30">
            {currentStage === "loading" && (
              <p className="text-sm">Loading video...</p>
            )}
            {currentStage === "analyzing" && (
              <p className="text-sm">Analyzing content...</p>
            )}
            {currentStage === "transcribing" && (
              <p className="text-sm">Transcribing audio...</p>
            )}
            {currentStage === "idle" && (
              <>
                <Sparkles
                  className="w-6 h-6 opacity-30 mb-3"
                  strokeWidth={1.5}
                />
                <p className="text-xs">Upload a video to generate clips</p>
              </>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
