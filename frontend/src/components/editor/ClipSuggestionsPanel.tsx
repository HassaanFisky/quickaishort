"use client";

import { useEditorStore } from "@/stores/editorStore";
import ClipCard from "./ClipCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wand2, Sparkles, AlertCircle } from "lucide-react";

export default function ClipSuggestionsPanel() {
  const suggestions = useEditorStore((state) => state.suggestions);
  const currentStage = useEditorStore((state) => state.currentStage);

  if (currentStage !== "ready" && suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[60vh] gap-4">
        <div className="bg-muted p-4 rounded-full animate-pulse">
          <Wand2 className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">No clips yet</h3>
          <p className="text-sm text-muted-foreground max-w-[200px] mt-2">
            Upload and analyze a video to see AI-suggested snippets here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4 animate-in fade-in slide-in-from-right-2 duration-500">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold uppercase tracking-wider text-primary">
            AI Suggestions
          </span>
        </div>
        <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">
          {suggestions.length} items
        </span>
      </div>

      <ScrollArea className="flex-1 -mx-4 px-4 overflow-y-auto max-h-[70vh]">
        <div className="grid grid-cols-1 gap-4 pb-8">
          {suggestions.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      </ScrollArea>

      {suggestions.length > 0 && (
        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 mt-auto">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-primary shrink-0" />
            <p className="text-xs text-balance leading-relaxed">
              Select a clip to refine the trimming and choose an aspect ratio in
              the Inspector.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
