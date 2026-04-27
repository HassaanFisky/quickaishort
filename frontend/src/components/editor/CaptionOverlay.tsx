"use client";

import { useRef, useEffect } from "react";
import { Transcript } from "@/types/pipeline";

interface CaptionOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  transcript?: Transcript;
}

export function CaptionOverlay({ videoRef, transcript }: CaptionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || !transcript) {
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
  }, [transcript, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
    />
  );
}
