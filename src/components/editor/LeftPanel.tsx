"use client";

import { useEditorStore } from "@/stores/editorStore";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Clock, Film, Zap, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";

const scoreRamp = (score: number) => {
  if (score >= 90)
    return {
      wrapper:
        "bg-gradient-to-r from-pink-500/20 to-purple-500/20 border-purple-500/40",
      text: "text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400",
      glow: true,
    };
  if (score >= 71)
    return {
      wrapper: "bg-purple-500/15 border-purple-500/30",
      text: "text-purple-400",
      glow: false,
    };
  if (score >= 41)
    return {
      wrapper: "bg-amber-500/15 border-amber-500/30",
      text: "text-amber-400",
      glow: false,
    };
  return { wrapper: "bg-white/5 border-white/10", text: "text-slate-500", glow: false };
};

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
    viralAnalysis?: {
      hookStrength: number;
      retentionPotential: number;
      emotionalTriggers: string[];
    };
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

  const score = clip.score ?? clip.confidence;
  const ramp = scoreRamp(score);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group relative p-5 rounded-2xl cursor-grab active:cursor-grabbing transition-all duration-200 focus-ring",
        isSelected
          ? "bg-white/[0.05] border border-primary/30 ring-1 ring-primary/20"
          : "bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] hover:border-white/10",
      )}
      tabIndex={0}
    >
      <div className="flex justify-between items-center mb-4">
        <div className="relative">
          {ramp.glow && (
            <div className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-purple-500/20 blur-md rounded-full animate-pulse" />
          )}
          <Badge
            className={cn(
              "relative font-black text-[10px] px-2.5 py-1 uppercase tracking-wider transition-all duration-500 border",
              ramp.wrapper,
            )}
          >
            {score >= 90 ? (
              <Zap className="w-3 h-3 mr-1 fill-pink-400" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            <span className={ramp.text}>Score: {score}</span>
          </Badge>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground/60 flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-md">
          <Clock className="w-3 h-3" />
          {Math.round(clip.end - clip.start)}s
        </span>
      </div>

      <h4
        className={cn(
          "font-black text-sm tracking-tight mb-1.5 transition-colors duration-300",
          isSelected ? "text-primary" : "text-slate-200 group-hover:text-white",
        )}
      >
        {clip.title || `Clip ${clip.id.split("-")[1]}`}
      </h4>
      <p className="text-[11px] leading-relaxed text-slate-400 line-clamp-2 mb-4 font-medium italic opacity-80">
        &ldquo;{clip.hook ?? clip.reason}&rdquo;
      </p>

      {/* Why This Works Section */}
      {clip.viralReasoning && (
        <div className="relative overflow-hidden p-4 rounded-xl bg-linear-to-br from-white/[0.03] to-transparent border border-white/[0.08] group/insight">
          <div className="absolute -top-4 -right-4 w-12 h-12 bg-primary/10 blur-2xl group-hover/insight:bg-primary/20 transition-all duration-700" />

          <div className="flex items-center gap-2 text-primary mb-2">
            <Info className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-[0.15em] opacity-80">
              Why This Works
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300 font-medium">
            {clip.viralReasoning}
          </p>

          {clip.viralAnalysis && (
            <div className="flex gap-3 mt-3 pt-3 border-t border-white/5">
              <div className="flex-1 text-center">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 mb-0.5">
                  Opening Power
                </p>
                <p className="text-[11px] font-black text-white">
                  {Math.round(clip.viralAnalysis.hookStrength * 100)}%
                </p>
              </div>
              <div className="flex-1 text-center border-x border-white/5">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 mb-0.5">
                  Watch-Through Rate
                </p>
                <p className="text-[11px] font-black text-white">
                  {Math.round(clip.viralAnalysis.retentionPotential * 100)}%
                </p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 mb-0.5">
                  Audience Hooks
                </p>
                <p className="text-[11px] font-black text-white">
                  {clip.viralAnalysis.emotionalTriggers.length}
                </p>
              </div>
            </div>
          )}

          {clip.suggestedCaptions && clip.suggestedCaptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {clip.suggestedCaptions.map((cap, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md bg-white/5 text-slate-400 text-[9px] font-bold border border-white/5 hover:border-primary/30 hover:text-primary transition-all duration-300"
                >
                  #{cap}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {isSelected && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2">
          <div className="w-1.5 h-10 bg-primary rounded-full shadow-[0_0_15px_rgba(139,92,246,0.8)]" />
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
    <div className="w-full h-full flex flex-col gap-6 animate-in fade-in slide-in-from-left-6 duration-1000 ease-fluid">
      {/* Source Info */}
      {sourceFile && (
        <div className="liquid-panel p-5 rounded-2xl flex gap-5 items-center group cursor-default">
          <div className="w-14 h-10 bg-primary/10 rounded-xl overflow-hidden relative flex items-center justify-center border border-primary/20 group-hover:border-primary/40 transition-colors">
            <Film className="w-5 h-5 text-primary" strokeWidth={1.5} />
            <div className="absolute inset-0 bg-linear-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[9px] font-black text-primary/60 truncate uppercase tracking-[0.2em] mb-1">
              Current Project
            </h3>
            <p className="text-sm font-bold truncate text-white tracking-tight">
              {sourceFile.name}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-primary rounded-full" />
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
            Viral Suggestions
          </span>
        </div>
        {hasSuggestions && (
          <Badge
            variant="secondary"
            className="bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-[10px] px-3 py-1 font-black rounded-full border border-white/5"
          >
            <Sparkles className="w-3 h-3 mr-1.5 text-primary" />
            {suggestions.length} CLIPS
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1 -mr-4 pr-4">
        {hasSuggestions ? (
          <DndContext collisionDetection={closestCenter}>
            <SortableContext
              items={suggestions}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4 pb-10">
                {suggestions.map((clip, index) => (
                  <motion.div
                    key={clip.id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      type: "spring",
                      damping: 24,
                      stiffness: 120,
                      delay: index * 0.06,
                    }}
                  >
                    <DraggableClip
                      clip={clip}
                      isSelected={selectedClipId === clip.id}
                      onClick={() => selectClip(clip.id)}
                    />
                  </motion.div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="h-[400px] flex flex-col items-center justify-center text-center p-10 rounded-3xl bg-white/[0.02] border border-dashed border-white/10 group">
            {currentStage !== "idle" ? (
              <div className="space-y-6 flex flex-col items-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl animate-pulse" />
                  <Sparkles
                    className="w-12 h-12 text-primary animate-bounce"
                    strokeWidth={1}
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-white tracking-tighter uppercase">
                    Analyzing...
                  </h3>
                  <p className="text-xs text-slate-500 font-medium max-w-[200px]">
                    {currentStage === "loading" && "Setting things up..."}
                    {currentStage === "analyzing" && "Analyzing viral potential..."}
                    {currentStage === "transcribing" && "Creating subtitles..."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 flex flex-col items-center opacity-60 group-hover:opacity-100 transition-opacity duration-700">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/10 mb-2">
                  <Zap
                    className="w-10 h-10 text-slate-600 group-hover:text-primary transition-colors duration-500"
                    strokeWidth={1}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-black text-white tracking-tight">
                    Ready When You Are
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium max-w-[180px]">
                    Paste a link above and we&apos;ll find your best clips automatically.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
