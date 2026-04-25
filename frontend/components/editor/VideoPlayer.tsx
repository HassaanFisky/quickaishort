"use client";

import React, { useRef, useEffect, useState } from "react";
import { useTimelineStore } from "@/lib/editor/timeline-state";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Maximize,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function VideoPlayer() {
  const { currentTime, isPlaying, clips, setCurrentTime, setIsPlaying } =
    useTimelineStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(80);

  const activeClip = clips.find(
    (c) => currentTime >= c.startTime && currentTime <= c.endTime,
  );

  useEffect(() => {
    if (videoRef.current && !isPlaying && activeClip) {
      const relativeTime = currentTime - activeClip.startTime;
      const videoTime = activeClip.trimIn + relativeTime;
      if (Math.abs(videoRef.current.currentTime - videoTime) > 0.1) {
        videoRef.current.currentTime = videoTime;
      }
    }
  }, [currentTime, clips, isPlaying, activeClip]);

  useEffect(() => {
    let animationId: number;

    if (isPlaying) {
      const startWall = performance.now();
      const startStoreTime = currentTime;

      const tick = () => {
        const elapsed = (performance.now() - startWall) / 1000;
        const newTime = startStoreTime + elapsed;
        setCurrentTime(newTime);
        animationId = requestAnimationFrame(tick);
      };
      animationId = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(animationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const handleFrameStep = (direction: number) => {
    const frameTime = 1 / 30;
    setCurrentTime(Math.max(0, currentTime + direction * frameTime));
  };

  const formatDisplay = (t: number): string => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-4 bg-neutral-950 p-6 rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden">
      <div className="relative aspect-video bg-black rounded-xl overflow-hidden group border border-neutral-900 shadow-inner">
        {activeClip ? (
          <video
            ref={videoRef}
            src={activeClip.videoUrl}
            className="w-full h-full object-contain"
            muted={volume === 0}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-neutral-700 bg-neutral-900/20 backdrop-blur-sm">
            <Loader2 className="w-12 h-12 mb-2 animate-pulse" />
            <p className="text-sm font-bold tracking-widest uppercase opacity-50">
              Empty Preview
            </p>
          </div>
        )}

        {!isPlaying && activeClip && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] cursor-pointer hover:bg-black/10 transition-all opacity-0 group-hover:opacity-100"
            onClick={() => setIsPlaying(true)}
          >
            <div className="bg-white/90 text-black p-4 rounded-full shadow-2xl scale-90 hover:scale-110 transition-transform">
              <Play size={32} fill="black" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-neutral-800 rounded-full"
            onClick={() => handleFrameStep(-1)}
          >
            <SkipBack size={18} />
          </Button>
          <Button
            size="icon"
            className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause size={24} fill="white" />
            ) : (
              <Play size={24} fill="white" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-neutral-800 rounded-full"
            onClick={() => handleFrameStep(1)}
          >
            <SkipForward size={18} />
          </Button>
        </div>

        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs font-mono text-neutral-500">
            {formatDisplay(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={Math.max(10, currentTime + 10)}
            step="0.01"
            value={currentTime}
            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-xs font-mono text-neutral-600">
            {activeClip ? `Track ${activeClip.track}` : "—"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-2 bg-neutral-900 rounded-lg p-1.5 border border-neutral-800">
            <Volume2 size={16} className="text-neutral-500" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(parseInt(e.target.value))}
              className="w-16 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-neutral-800 rounded-lg"
          >
            <Maximize size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
