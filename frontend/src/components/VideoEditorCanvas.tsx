"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import type { Caption, FrameFilter } from "@/stores/editorStore";

interface CanvasFilter {
  brightness: string;
  contrast: string;
  saturation: string;
  hueRotate: string;
  blur: string;
}

interface RenderMetrics {
  frameCount: number;
  frameTime: number;
  fps: number;
}

export default function VideoEditorCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const metricsRef = useRef<RenderMetrics>({ frameCount: 0, frameTime: Date.now(), fps: 0 });

  const frameFilters = useEditorStore((state) => state.frameFilters);
  const captions = useEditorStore((state) => state.captions);
  const currentTime = useEditorStore((state) => state.currentTime);
  const videoMetadata = useEditorStore((state) => state.videoMetadata);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const sourceUrl = useEditorStore((state) => state.sourceUrl);
  const videoElementRef = useEditorStore((state) => state.videoElementRef);
  const setVideoElementRef = useEditorStore((state) => state.setVideoElementRef);

  // Initialize canvas context on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        contextRef.current = ctx;
        // Set canvas dimensions to match video metadata
        if (videoMetadata) {
          canvas.width = videoMetadata.nativeWidth || 1280;
          canvas.height = videoMetadata.nativeHeight || 720;
        } else {
          canvas.width = 1280;
          canvas.height = 720;
        }
      }
    }
  }, [videoMetadata]);

  // Register video element ref with store for external access
  useEffect(() => {
    if (videoRef.current && !videoElementRef) {
      setVideoElementRef(videoRef as React.RefObject<HTMLVideoElement>);
    }
  }, [videoElementRef, setVideoElementRef]);

  // Convert FrameFilter to CSS filter string
  const buildFilterString = useCallback((filters: FrameFilter): CanvasFilter => {
    return {
      brightness: `brightness(${filters.brightness})`,
      contrast: `contrast(${filters.contrast})`,
      saturation: `saturate(${filters.saturation})`,
      hueRotate: `hue-rotate(${filters.hue}deg)`,
      blur: `blur(${filters.blur}px)`,
    };
  }, []);

  // Binary search to find active caption at timestamp
  const findActiveCaption = useCallback(
    (timestamp: number): Caption | null => {
      if (captions.length === 0) return null;

      // Simple binary search implementation
      let left = 0;
      let right = captions.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const caption = captions[mid];

        if (timestamp < caption.startTime) {
          right = mid - 1;
        } else if (timestamp > caption.endTime) {
          left = mid + 1;
        } else {
          return caption;
        }
      }

      return null;
    },
    [captions],
  );

  // Render caption text on canvas with styling
  const renderCaption = useCallback(
    (ctx: CanvasRenderingContext2D, caption: Caption, canvasHeight: number, canvasWidth: number) => {
      const style = caption.style;

      // Setup text properties
      const fontSize = style.fontSize;
      ctx.font = `${style.bold ? "bold" : "normal"} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`;
      ctx.fillStyle = style.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Measure text for background box
      const textMetrics = ctx.measureText(caption.text);
      const textWidth = textMetrics.width;
      const textHeight = fontSize;
      const padding = 12;

      // Calculate Y position based on style.position
      let y = canvasHeight / 2;
      if (style.position === "top") {
        y = fontSize + padding * 2;
      } else if (style.position === "bottom") {
        y = canvasHeight - fontSize - padding * 2;
      }

      const x = canvasWidth / 2;
      const bgX = x - textWidth / 2 - padding;
      const bgY = y - textHeight / 2 - padding;
      const bgWidth = textWidth + padding * 2;
      const bgHeight = textHeight + padding * 2;

      // Draw background box
      if (style.background && style.background !== "transparent") {
        ctx.fillStyle = style.background;
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
      }

      // Draw text
      ctx.fillStyle = style.color;
      ctx.fillText(caption.text, x, y);
    },
    [],
  );

  // Main 60fps rendering loop using requestAnimationFrame
  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = contextRef.current;

    if (!video || !canvas || !ctx) {
      animationFrameIdRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video frame onto canvas
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      // Video not ready yet
    }

    // Apply filters via canvas compositing and filter properties
    const filterString = buildFilterString(frameFilters);
    const appliedFilters = [
      filterString.brightness,
      filterString.contrast,
      filterString.saturation,
      filterString.hueRotate,
      filterString.blur,
    ].join(" ");

    canvas.style.filter = appliedFilters;

    // Render active caption
    const activeCaption = findActiveCaption(video.currentTime);
    if (activeCaption) {
      renderCaption(ctx, activeCaption, canvas.height, canvas.width);
    }

    // Update FPS metrics (sample every 100ms)
    const now = Date.now();
    metricsRef.current.frameCount++;
    if (now - metricsRef.current.frameTime >= 100) {
      metricsRef.current.fps = Math.round((metricsRef.current.frameCount * 1000) / (now - metricsRef.current.frameTime));
      metricsRef.current.frameCount = 0;
      metricsRef.current.frameTime = now;
    }

    // Schedule next frame
    animationFrameIdRef.current = requestAnimationFrame(renderFrame);
  }, [frameFilters, findActiveCaption, renderCaption, buildFilterString]);

  // Start/stop animation loop based on playback state
  useEffect(() => {
    if (isPlaying) {
      animationFrameIdRef.current = requestAnimationFrame(renderFrame);
    } else if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      // Still render one frame for display when paused
      renderFrame();
    }

    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [isPlaying, renderFrame]);

  // Update video element currentTime when store currentTime changes
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.1) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden shadow-lg">
      {/* Hidden video element for source */}
      <video
        ref={videoRef}
        className="hidden"
        crossOrigin="anonymous"
        preload="metadata"
        src={sourceUrl || undefined}
      />

      {/* Canvas for rendering with filters and captions */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain bg-black"
        style={{
          display: "block",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      />

      {/* Debug overlay (optional, can be removed in production) */}
      <div className="absolute top-2 right-2 text-xs text-gray-400 pointer-events-none font-mono">
        <div>FPS: {metricsRef.current.fps}</div>
        <div>Time: {videoRef.current?.currentTime.toFixed(2) || "0.00"}s</div>
      </div>
    </div>
  );
}
