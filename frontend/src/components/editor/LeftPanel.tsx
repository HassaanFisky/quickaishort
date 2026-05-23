"use client";

import { useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Clock, Film, Zap, Info, Type, Shapes, Scissors, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "clips" | "text" | "elements";

const scoreRamp = (score: number) => {
  if (score >= 90)
    return {
      wrapper: "bg-primary/10 border-primary/30",
      text: "text-primary",
      glow: true,
    };
  if (score >= 71)
    return {
      wrapper: "bg-accent/15 border-accent/30",
      text: "text-accent",
      glow: false,
    };
  if (score >= 41)
    return {
      wrapper: "bg-amber-500/15 border-amber-500/30",
      text: "text-amber-400",
      glow: false,
    };
  return { wrapper: "bg-foreground/5 border-foreground/10", text: "text-muted-foreground", glow: false };
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
        "group relative p-4 rounded-xl cursor-grab active:cursor-grabbing transition-all duration-300",
        isSelected
          ? "nano-glass bg-primary/10 border-primary/40 border-l-4 border-l-primary shadow-[0_0_20px_rgba(168,85,247,0.1)]"
          : "nano-glass border-white/5 hover:bg-white/5 hover:border-white/20 hover:-translate-y-0.5",
      )}
      tabIndex={0}
    >
      <div className="flex justify-between items-center mb-4">
        <div className="relative">
          {ramp.glow && (
            <div className="absolute inset-0 bg-primary/20 blur-md rounded-full animate-pulse" />
          )}
          <Badge
            className={cn(
              "relative font-black text-[10px] px-2.5 py-1 uppercase tracking-wider transition-all duration-500 border",
              ramp.wrapper,
            )}
          >
            {score >= 90 ? (
              <Zap className="w-3 h-3 mr-1 fill-current" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            <span className={ramp.text}>Score: {score}</span>
          </Badge>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground/60 flex items-center gap-1.5 bg-foreground/5 px-2 py-1 rounded-md">
          <Clock className="w-3 h-3" />
          {Math.round(clip.end - clip.start)}s
        </span>
      </div>

      <h4
        className={cn(
          "font-black text-sm tracking-tight mb-1.5 transition-colors duration-300",
          isSelected ? "text-primary" : "text-foreground/80 group-hover:text-foreground",
        )}
      >
        {clip.title || `Clip ${clip.id.split("-")[1]}`}
      </h4>
      <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2 mb-4 font-medium italic opacity-80">
        &ldquo;{clip.hook ?? clip.reason}&rdquo;
      </p>

      {clip.viralReasoning && (
        <div className="relative overflow-hidden p-4 rounded-xl glass-surface border-white/5 group/insight mt-4">
          <div className="absolute -top-4 -right-4 w-12 h-12 bg-primary/10 blur-2xl group-hover/insight:bg-primary/30 transition-all duration-700" />
          <div className="flex items-center gap-2 text-primary mb-2">
            <Info className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-[0.15em] opacity-80">
              Why This Works
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/70 font-medium">
            {clip.viralReasoning}
          </p>
        </div>
      )}
    </div>
  );
}

export default function LeftPanel() {
  const { suggestions, selectedClipId, selectClip, setSuggestions, sourceFile, sourceUrl, currentStage, agentStates, addCanvasElement } =
    useEditorStore();
  const [activeTab, setActiveTab] = useState<Tab>("clips");

  const analysisErrored = agentStates.viralAnalysis.status === "error";
  const hasSource = !!(sourceFile || sourceUrl);

  const handleRetry = () => {
    window.dispatchEvent(new Event("retry-analysis"));
  };
  const hasSuggestions = suggestions.length > 0;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = suggestions.findIndex((c) => c.id === active.id);
    const newIndex = suggestions.findIndex((c) => c.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      setSuggestions(arrayMove(suggestions, oldIndex, newIndex));
    }
  }

  const tabs = [
    { id: "clips", icon: Scissors, label: "Clips" },
    { id: "text", icon: Type, label: "Text" },
    { id: "elements", icon: Shapes, label: "Elements" },
  ];

  return (
    <div className="w-full h-full flex flex-col gap-6 animate-in fade-in slide-in-from-left-6 duration-1000 ease-fluid">
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-2xl bg-foreground/5 border border-foreground/5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 relative overflow-hidden",
              activeTab === tab.id
                ? "text-primary bg-background shadow-lg border border-foreground/5"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-primary/5 -z-10"
              />
            )}
            <tab.icon className={cn("w-3.5 h-3.5", activeTab === tab.id ? "text-primary" : "text-muted-foreground")} />
            {tab.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 -mr-4 pr-4">
        <AnimatePresence mode="wait">
          {activeTab === "clips" && (
            <motion.div
              key="clips"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {hasSuggestions ? (
                <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={suggestions} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4 pb-10">
                      {suggestions.map((clip, index) => (
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
              ) : analysisErrored && hasSource ? (
                /* Analysis failed — show retry button (Bug 10) */
                <div className="h-[400px] flex flex-col items-center justify-center text-center p-10 rounded-3xl glass-surface border-red-500/20 group">
                  <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-6">
                    <Zap className="w-10 h-10 text-red-400" strokeWidth={1} />
                  </div>
                  <h3 className="text-sm font-black text-foreground tracking-tight mb-2">Analysis Failed</h3>
                  <p className="text-[11px] text-muted-foreground font-medium max-w-[180px] mb-6">
                    Could not generate clip suggestions. The video may be restricted, or the server timed out.
                  </p>
                  <button
                    onClick={handleRetry}
                    className="px-5 py-2 rounded-full bg-primary/10 border border-primary/30 text-[10px] font-black text-primary uppercase tracking-widest hover:bg-primary/20 transition-colors"
                  >
                    Retry Analysis
                  </button>
                </div>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-center p-10 rounded-3xl glass-surface border-white/5 group">
                  <div className="w-20 h-20 rounded-full bg-foreground/5 flex items-center justify-center border border-foreground/10 mb-6">
                    <Zap className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors duration-500" strokeWidth={1} />
                  </div>
                  <h3 className="text-sm font-black text-foreground tracking-tight mb-2">No Candidates Yet</h3>
                  <p className="text-[11px] text-muted-foreground font-medium max-w-[180px]">Analyze a video to find viral clips automatically.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "text" && (
            <motion.div
              key="text"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: "Add Heading", size: "text-2xl font-black", content: "ADD HEADING" },
                  { label: "Add Subheading", size: "text-lg font-bold", content: "Add subheading" },
                  { label: "Add Body Text", size: "text-sm font-medium", content: "Add body text" },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => addCanvasElement({
                      type: "text",
                      content: item.content,
                      x: 100,
                      y: 100,
                      scale: 1,
                      rotation: 0,
                      style: { className: item.size }
                    })}
                    className="w-full p-6 rounded-2xl border border-white/5 hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 text-left group"
                  >
                    <span className={cn("block mb-1", item.size)}>{item.label}</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Click to add</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "elements" && (
            <motion.div
              key="elements"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-2 gap-3"
            >
              {["🔥", "🚀", "💡", "🎯", "✨", "✅", "❌", "💎"].map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => addCanvasElement({
                    type: "sticker",
                    content: emoji,
                    x: 150,
                    y: 150,
                    scale: 1,
                    rotation: 0
                  })}
                  className="aspect-square rounded-2xl border border-white/5 flex items-center justify-center text-3xl hover:bg-white/5 hover:border-primary/20 transition-all duration-300 group"
                >
                  <span className="group-hover:scale-125 transition-transform">{emoji}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}
