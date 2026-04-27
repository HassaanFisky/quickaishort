"use client";

import { useEditorStore } from "@/stores/editorStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Type, Save, MessageSquare, AlertTriangle } from "lucide-react";

export default function TranscriptionPanel() {
  const transcript = useEditorStore((state) => state.transcript);
  const currentStage = useEditorStore((state) => state.currentStage);

  if (!transcript && currentStage !== "ready") {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[60vh] gap-4">
        <div className="bg-muted p-4 rounded-full">
          <Type className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">No transcript yet</h3>
          <p className="text-sm text-muted-foreground max-w-[200px] mt-2">
            Captions will appear here once the video is analyzed.
          </p>
        </div>
      </div>
    );
  }

  // Handle different transcript formats (Xenova returns different structures depending on options)
  const segments = transcript?.chunks || transcript?.segments || [];

  return (
    <div className="flex flex-col h-full gap-4 animate-in fade-in slide-in-from-right-2 duration-500">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold uppercase tracking-wider text-primary">
            Captions Editor
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
          <Save className="w-3 h-3" /> Save
        </Button>
      </div>

      <ScrollArea className="flex-1 -mx-4 px-4 overflow-y-auto max-h-[70vh]">
        <div className="space-y-3 pb-8">
          {segments.length > 0 ? (
            segments.map(
              (
                seg: { timestamp?: number[]; start?: number; text: string },
                i: number,
              ) => (
                <div
                  key={i}
                  className="group flex flex-col gap-1.5 p-3 rounded-xl border bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    <span>
                      {seg.timestamp?.[0]?.toFixed(2) || seg.start?.toFixed(2)}s
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-primary">
                      Edit Time
                    </span>
                  </div>
                  <textarea
                    className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-auto min-h-[40px] leading-relaxed py-0 px-0"
                    defaultValue={seg.text}
                    rows={1}
                    onChange={(e) => {
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                  />
                </div>
              ),
            )
          ) : (
            <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl flex gap-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-500/80 leading-relaxed">
                Transcript format unrecognized or empty. Try reprocessing the
                video with a different Whisper model.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Style Presets
          </span>
          <span className="text-xs font-semibold text-primary">3 Active</span>
        </div>
        <div className="flex gap-2">
          {["Modern", "Bold", "Classic"].map((style) => (
            <Button
              key={style}
              variant="outline"
              size="sm"
              className="flex-1 h-8 rounded-lg text-[10px] font-bold py-0"
            >
              {style}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
