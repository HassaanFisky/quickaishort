"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Star, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editorStore";

interface ClipCardProps {
  clip: {
    id: string;
    start: number;
    end: number;
    confidence: number;
    reason: string;
  };
}

export default function ClipCard({ clip }: ClipCardProps) {
  const selectedClipId = useEditorStore((state) => state.selectedClipId);
  const setSelectedClip = useEditorStore((state) => state.setSelectedClip);

  const isSelected = selectedClipId === clip.id;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-300 overflow-hidden group border-2",
        isSelected
          ? "border-primary bg-primary/5 ring-4 ring-primary/10"
          : "hover:border-primary/50",
      )}
      onClick={() => setSelectedClip(clip.id)}
    >
      <CardContent className="p-0">
        <div className="relative aspect-video bg-muted flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 z-20"
          >
            <Play className="fill-current w-4 h-4" />
          </Button>
          <div className="absolute bottom-2 left-2 flex gap-1 z-20">
            <Badge
              variant="secondary"
              className="bg-black/50 text-white border-none backdrop-blur-md font-mono text-[10px]"
            >
              {formatTime(clip.start)} - {formatTime(clip.end)}
            </Badge>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500 fill-current" />
              <span className="font-bold text-sm">
                {clip.confidence}% confidence
              </span>
            </div>
            {isSelected && <CheckCircle2 className="w-4 h-4 text-primary" />}
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 italic">
            &quot;{clip.reason}&quot;
          </p>

          <div className="flex items-center gap-2 pt-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
              {Math.floor(clip.end - clip.start)}s duration
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
