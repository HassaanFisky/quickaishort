"use client";

import { useRef, useEffect } from "react";
import { Transcript } from "@/types/pipeline";
import { RenderCaption } from "@/lib/render/renderManifest";

// Phase 54: manifest captions are preferred when active; legacy captions remain fallback.

interface CaptionOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  transcript?: Transcript;
  manifestActiveCaptionIds?: string[];
  manifestActiveCaptions?: RenderCaption[];
}

interface SafeCaptionStyle {
  fontSize?: number;
  color?: string;
  position?: "top" | "middle" | "bottom";
  bold?: boolean;
}

function parseCaptionStyle(raw: unknown): SafeCaptionStyle {
  if (!raw || typeof raw !== "object") return {};
  const s = raw as Record<string, unknown>;
  return {
    fontSize: typeof s.fontSize === "number" ? s.fontSize : undefined,
    color: typeof s.color === "string" ? s.color : undefined,
    position:
      s.position === "top" || s.position === "middle" || s.position === "bottom"
        ? s.position
        : undefined,
    bold: typeof s.bold === "boolean" ? s.bold : undefined,
  };
}

export function CaptionOverlay({
  videoRef,
  transcript,
  manifestActiveCaptionIds,
  manifestActiveCaptions,
}: CaptionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  // Manifest-driven caption rendering loop
  useEffect(() => {
    const hasManifestCaptions =
      Array.isArray(manifestActiveCaptions) && manifestActiveCaptions.length > 0;
    if (!hasManifestCaptions) return;

    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }

      if (video.paused || video.ended) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (
        canvas.width !== canvas.offsetWidth ||
        canvas.height !== canvas.offsetHeight
      ) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const time = video.currentTime;

      // Render each active manifest caption at current time
      const activeCaptions = (manifestActiveCaptions ?? []).filter((c) => {
        const start = typeof c.startTime === "number" ? c.startTime : 0;
        const end = typeof c.endTime === "number" ? c.endTime : 0;
        return time >= start && time <= end;
      });

      activeCaptions.forEach((caption) => {
        const style = parseCaptionStyle(caption.style);
        const text = caption.text?.trim() ?? "";
        if (!text) return;

        const fontSize = style.fontSize ?? 64;
        const color = style.color ?? "#FFFF00";
        const bold = style.bold ?? true;
        const position = style.position ?? "bottom";

        const yFraction =
          position === "top" ? 0.15 : position === "middle" ? 0.5 : 0.75;

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height * yFraction);

        const fontWeight = bold ? "900" : "400";
        ctx.font = `${fontWeight} ${fontSize}px var(--font-montserrat), sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.shadowColor = "black";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;

        ctx.lineWidth = 12;
        ctx.strokeStyle = "black";
        ctx.strokeText(text, 0, 0);

        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);

        ctx.restore();
      });

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(requestRef.current);
  }, [manifestActiveCaptions, videoRef]);

  // Legacy transcript-driven rendering (fallback when no manifest captions are active)
  useEffect(() => {
    const hasManifestCaptions =
      Array.isArray(manifestActiveCaptions) && manifestActiveCaptions.length > 0;
    if (hasManifestCaptions || !transcript) return;

    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }

      // Skip the draw and reschedule only when playing — avoids running at 60fps
      // while the video is paused, which burns CPU/battery with no visible change.
      if (video.paused || video.ended) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Sync canvas size
      if (
        canvas.width !== canvas.offsetWidth ||
        canvas.height !== canvas.offsetHeight
      ) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      }

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Find active word
      // Handle both chunks and segments structure
      const words = transcript.segments || transcript.chunks;
      const time = video.currentTime;

      const activeWord = words.find((w) => time >= w.start && time <= w.end);

      if (activeWord) {
        const text = activeWord.text.trim();
        const duration = activeWord.end - activeWord.start;
        const progress = (time - activeWord.start) / duration;

        // "Pop-in" Animation
        // Scale goes from 0.8 to 1.0 in first 100ms
        let scale = 1.0;
        const popDuration = 0.1; // 100ms
        if (progress * duration < popDuration) {
          const t = (progress * duration) / popDuration;
          // Elastic ease out
          scale = 0.8 + 0.2 * Math.sin((t * Math.PI) / 2);
        }

        // Styling
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height * 0.75);
        ctx.scale(scale, scale);

        ctx.font = "900 64px var(--font-montserrat), sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Shadow (Hard drop shadow)
        ctx.shadowColor = "black";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;

        // Stroke
        ctx.lineWidth = 12;
        ctx.strokeStyle = "black";
        ctx.strokeText(text, 0, 0);

        // Fill (Yellow or White)
        // Highlight logic example: High confidence words are yellow?
        // Or just alternating colors? For now: Yellow/White pop.
        ctx.fillStyle = "#FFFF00"; // Yellow
        ctx.fillText(text, 0, 0);

        ctx.restore();
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(requestRef.current);
  }, [transcript, videoRef, manifestActiveCaptions]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
    />
  );
}
