"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  const [isBuffering, setIsBuffering] = useState(false);
  const {
    sourceUrl,
    selectedClipId,
    suggestions,
    transcript,
    duration,
    currentTime,
    isPlaying,
    pendingSeek,
    setCurrentTime,
    setIsPlaying,
    setDuration,
    clearPendingSeek,
  } = useEditorStore();

  const { isReady, reframingData, detect } = useFaceTracker();

  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceUrl) {
      setDisplayUrl(null);
      return;
    }
    
    if (sourceUrl.includes("youtube.com") || sourceUrl.includes("youtu.be")) {
      import("@/lib/api").then(({ getProxyUrl }) => {
        setDisplayUrl(getProxyUrl(sourceUrl));
      });
    } else {
      setDisplayUrl(sourceUrl);
    }
  }, [sourceUrl]);

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

  // Drive the video element from store isPlaying
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

  // Respond to external seek requests (e.g. from Timeline slider)
  useEffect(() => {
    if (pendingSeek == null || !videoRef.current) return;
    videoRef.current.currentTime = pendingSeek;
    setCurrentTime(pendingSeek);
    clearPendingSeek();
  }, [pendingSeek, clearPendingSeek, setCurrentTime]);

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
    <div className="flex-1 flex flex-col items-center justify-center p-6 h-full animate-in fade-in zoom-in-95 duration-1000">
      <div className="relative aspect-9/16 h-full max-h-[75vh] depth-card glass-surface rounded-[2.5rem] overflow-hidden flex items-center justify-center group w-auto border border-foreground/5 shadow-2xl">
        {(!isReady || isBuffering) && (
          <div className="absolute top-6 right-6 z-50">
            <div className="flex items-center gap-2 glass-surface border border-foreground/10 px-3 py-1.5 rounded-full text-[10px] font-black text-muted-foreground uppercase tracking-widest shadow-xl">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              {isBuffering ? "Buffering..." : "Vision Active"}
            </div>
          </div>
        )}

        {sourceUrl ? (
          <>
            <video
              ref={videoRef}
              src={displayUrl || sourceUrl}
              className={cn(
                "w-full h-full object-cover interactive will-change-[object-position] transition-all duration-500",
                isBuffering && "blur-md scale-105 opacity-50"
              )}
              style={{ objectPosition: getObjectPosition() }}
              controls={false}
              loop
              onLoadedMetadata={() => {
                if (videoRef.current) setDuration(videoRef.current.duration);
              }}
              onWaiting={() => setIsBuffering(true)}
              onCanPlay={() => setIsBuffering(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={() => {
                if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
              }}
            />
            {isBuffering && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="w-12 h-12 animate-spin text-primary opacity-50" strokeWidth={1} />
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground text-sm flex flex-col items-center gap-6">
            <div className="bg-foreground/5 p-8 rounded-full border border-foreground/10 shadow-inner group-hover:scale-110 transition-transform duration-700">
              <PlayCircle className="w-12 h-12 opacity-20 text-foreground" strokeWidth={1} />
            </div>
            <div className="space-y-1 text-center">
              <span className="opacity-40 tracking-[0.3em] text-[10px] uppercase font-black block">
                No Signal
              </span>
              <span className="opacity-20 text-[9px] font-bold uppercase tracking-widest block">
                Waiting for input...
              </span>
            </div>
          </div>
        )}

        <CaptionOverlay videoRef={videoRef} transcript={transcript || undefined} />

        {sourceUrl && !isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 interactive">
            <Button
              variant="ghost"
              size="icon"
              className="w-20 h-20 rounded-full text-white hover:bg-white/10 interactive-scale backdrop-blur-md border border-white/10 shadow-2xl"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="w-10 h-10 fill-current" />
              ) : (
                <Play className="w-10 h-10 fill-current pl-1.5" />
              )}
            </Button>
          </div>
        )}
      </div>

      {sourceUrl && (
        <div className="mt-8 flex items-center gap-6 glass-surface p-2.5 px-6 rounded-full border border-foreground/5 shadow-2xl">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary hover:bg-foreground/5 rounded-full w-10 h-10 interactive"
            onClick={() => skip(-10)}
            title="Back 10s"
          >
            <SkipBack className="w-4 h-4" strokeWidth={1.5} />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="w-14 h-14 rounded-full bg-primary text-white hover:scale-110 active:scale-95 shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all interactive"
            onClick={togglePlay}
            disabled={isBuffering}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current pl-1" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary hover:bg-foreground/5 rounded-full w-10 h-10 interactive"
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
