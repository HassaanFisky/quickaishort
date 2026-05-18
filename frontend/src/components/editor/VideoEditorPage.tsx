"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { findActiveCaption, buildCSSFilter, detectAspectRatio } from "@/lib/captionEngine";
import { AIPanel } from "./AIPanel";
import { FilterControls } from "./FilterControls";
import { motion, AnimatePresence } from "framer-motion";

interface VideoEditorPageProps {
  videoUrl: string;
  videoTitle: string;
}

export function VideoEditorPage({ videoUrl, videoTitle }: VideoEditorPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameRef = useRef<number>(0);

  const {
    videoMetadata,
    setVideoMetadata,
    setCurrentTime,
    setIsPlaying,
    setVideoElementRef,
    captions,
    frameFilters,
    trimMarker,
    aiPanelOpen,
    setAIPanelOpen,
    isPlaying,
  } = useEditorStore();

  const [activeCaption, setActiveCaption] = useState<string | null>(null);

  // Register video ref in store for AI dispatcher SEEK/PLAY/PAUSE
  useEffect(() => {
    setVideoElementRef(videoRef as React.RefObject<HTMLVideoElement>);
  }, [setVideoElementRef]);

  // 60fps caption tracking + trim enforcement loop
  const trackLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const t = video.currentTime;
    setCurrentTime(t);

    const cap = findActiveCaption(captions, t);
    setActiveCaption(cap?.text ?? null);

    if (trimMarker) {
      if (t < trimMarker.startTime) {
        video.currentTime = trimMarker.startTime;
      } else if (t > trimMarker.endTime) {
        video.pause();
        video.currentTime = trimMarker.startTime;
      }
    }

    animFrameRef.current = requestAnimationFrame(trackLoop);
  }, [captions, trimMarker, setCurrentTime]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(trackLoop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [trackLoop]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoMetadata({
      id: crypto.randomUUID(),
      url: videoUrl,
      title: videoTitle,
      duration: video.duration,
      nativeWidth: video.videoWidth,
      nativeHeight: video.videoHeight,
      fps: 30,
    });
  };

  const aspectRatio = videoMetadata
    ? detectAspectRatio(videoMetadata.nativeWidth, videoMetadata.nativeHeight)
    : "16 / 9";

  const isPortrait = videoMetadata
    ? videoMetadata.nativeHeight > videoMetadata.nativeWidth
    : false;

  const filterString = buildCSSFilter(frameFilters);

  return (
    <div className="editor-root">
      <div className={`video-stage ${isPortrait ? "stage-portrait" : "stage-landscape"}`}>
        <div className="video-wrapper" style={{ aspectRatio }}>
          <video
            ref={videoRef}
            src={videoUrl}
            className="video-element"
            style={{ filter: filterString }}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            controls={false}
            playsInline
            crossOrigin="anonymous"
          />

          <AnimatePresence mode="wait">
            {activeCaption && (
              <motion.div
                key={activeCaption}
                className="caption-overlay"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <span className="caption-text">{activeCaption}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {trimMarker && (
            <div className="trim-badge">
              ✂ {trimMarker.startTime.toFixed(1)}s — {trimMarker.endTime.toFixed(1)}s
            </div>
          )}
        </div>

        <VideoControls videoRef={videoRef} isPlaying={isPlaying} />
      </div>

      <FilterControls />

      <button
        className="ai-panel-toggle"
        onClick={() => setAIPanelOpen(!aiPanelOpen)}
        aria-label="Toggle AI Editor"
      >
        <span className="ai-toggle-icon">✦</span>
        <span className="ai-toggle-label">AI Edit</span>
      </button>

      <AIPanel />
    </div>
  );
}

function VideoControls({
  videoRef,
  isPlaying,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  isPlaying: boolean;
}) {
  const { currentTime, videoMetadata } = useEditorStore();
  const duration = videoMetadata?.duration || 1;

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    isPlaying ? v.pause() : v.play();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = parseFloat(e.target.value);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="video-controls">
      <button className="ctrl-btn play-btn" onClick={toggle}>
        {isPlaying ? "⏸" : "▶"}
      </button>
      <div className="seek-track">
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={currentTime}
          onChange={seek}
          className="seek-slider"
        />
      </div>
      <span className="time-display">
        {fmt(currentTime)} / {fmt(duration)}
      </span>
    </div>
  );
}
