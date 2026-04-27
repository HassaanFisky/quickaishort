"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  PlayCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editorStore";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import { CaptionOverlay } from "./CaptionOverlay";
import { cn } from "@/lib/utils";

export default function VideoCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    sourceUrl,
    selectedClipId,
    suggestions,
    transcript,
    duration,
    currentTime,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
  } = useEditorStore();

  const { isReady, reframingData, detect } = useFaceTracker();

  // Seek to clip start when selection changes
  useEffect(() => {
    if (selectedClipId && videoRef.current) {
      const clip = suggestions.find((c) => c.id === selectedClipId);
      if (clip) {
        videoRef.current.currentTime = clip.start;
        setCurrentTime(clip.start);
      }
    }
  }, [selectedClipId, suggestions, setCurrentTime]);

  // Drive the video element from store isPlaying (BottomDock can also control this)
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const skip = useCallback((delta: number) => {
    if (!videoRef.current) return;
    const next = Math.max(0, Math.min(duration || videoRef.current.duration || 0, currentTime + delta));
    videoRef.current.currentTime = next;
    setCurrentTime(next);
  }, [currentTime, duration, setCurrentTime]);

  // Face detection loop
  const detectRef = useRef(detect);
  useEffect(() => { detectRef.current = detect; }, [detect]);

  useEffect(() => {
    if (!isPlaying) return;
    let id: number;
    const animate = () => {
      if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
        detectRef.current(videoRef.current);
      }
      id = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(id);
  }, [isPlaying]);

  const getObjectPosition = () => {
    if (!reframingData?.faceDetected) return "50% 50%";
    const { x, y } = reframingData.center;
    return `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 h-full">
      <div className="relative aspect-9/16 h-full max-h-[75vh] liquid-panel rounded-3xl overflow-hidden flex items-center justify-center group w-auto">
        {!isReady && (
          <div className="absolute top-4 right-4 z-50">
            <div className="flex items-center gap-2 liquid-panel px-3 py-1.5 rounded-full text-[10px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Initializing Vision
            </div>
          </div>
        )}

        {sourceUrl ? (
          <video
            ref={videoRef}
            src={sourceUrl}
            className={cn("w-full h-full object-cover interactive will-change-[object-position]")}
            style={{ objectPosition: getObjectPosition() }}
            controls={false}
            loop
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
          />
        ) : (
          <div className="text-muted-foreground text-sm flex flex-col items-center gap-4">
            <div className="bg-white/3 p-6 rounded-full ghost-border">
              <PlayCircle className="w-10 h-10 opacity-20" strokeWidth={1} />
            </div>
            <span className="opacity-40 tracking-widest text-[10px] uppercase font-medium">
              No Signal
            </span>
          </div>
        )}

        <CaptionOverlay videoRef={videoRef} transcript={transcript || undefined} />

        {sourceUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 interactive">
            <Button
              variant="ghost"
              size="icon"
              className="w-16 h-16 rounded-full text-white hover:bg-white/10 interactive-scale backdrop-blur-sm"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-current" />
              ) : (
                <Play className="w-8 h-8 fill-current pl-1" />
              )}
            </Button>
          </div>
        )}
      </div>

      {sourceUrl && (
        <div className="mt-6 flex items-center gap-4 liquid-panel p-2 px-4 rounded-full">
          <Button
            variant="ghost"
            size="icon"
            className="hover:text-primary hover:bg-white/4 rounded-full w-9 h-9 interactive"
            onClick={() => skip(-10)}
            title="Back 10s"
          >
            <SkipBack className="w-4 h-4" strokeWidth={1.5} />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="w-11 h-11 rounded-full bg-foreground text-background hover:bg-foreground/90 elevation-2 interactive"
            onClick={togglePlay}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current pl-0.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hover:text-primary hover:bg-white/4 rounded-full w-9 h-9 interactive"
            onClick={() => skip(10)}
            title="Forward 10s"
          >
            <SkipForward className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        </div>
      )}
    </div>
  );
}
