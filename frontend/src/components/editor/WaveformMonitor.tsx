"use client";

import { useRef, useEffect, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";

const W = 256;
const H = 120;

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  width: number,
  height: number
) {
  const { data, width: iw } = imageData;
  const scaleX = width / iw;
  for (let x = 0; x < iw; x += 2) {
    for (let y = 0; y < imageData.height; y += 2) {
      const i = (y * iw + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const plotY = height - (luma / 255) * height;
      ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
      ctx.fillRect(Math.floor(x * scaleX), plotY, 1, 1);
    }
  }
}

export default function WaveformMonitor({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement>(null);
  const storeRef = useEditorStore((s) => s.videoElementRef);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let rafId: number;
    let lastDraw = 0;
    const INTERVAL = 100;

    function tick(now: number) {
      rafId = requestAnimationFrame(tick);
      if (now - lastDraw < INTERVAL) return;
      lastDraw = now;

      const canvas = canvasRef.current;
      const scratch = scratchRef.current;
      if (!canvas || !scratch) return;

      const ctx = canvas.getContext("2d");
      const sctx = scratch.getContext("2d");
      if (!ctx || !sctx) return;

      const video =
        storeRef?.current ??
        (document.querySelector("video") as HTMLVideoElement | null);
      if (!video || video.readyState < 2) return;

      scratch.width = Math.min(video.videoWidth || 320, 320);
      scratch.height = Math.min(video.videoHeight || 180, 180);

      try {
        sctx.drawImage(video, 0, 0, scratch.width, scratch.height);
        const imageData = sctx.getImageData(0, 0, scratch.width, scratch.height);

        ctx.fillStyle = "rgb(10,10,10)";
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        for (const p of [0.25, 0.5, 0.75]) {
          const gy = H - p * H;
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
        }

        drawWaveform(ctx, imageData, W, H);
        setBlocked(false);
      } catch {
        setBlocked(true);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [storeRef]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="relative rounded-lg overflow-hidden bg-[#0a0a0a] border border-border">
        <canvas ref={scratchRef} className="hidden" aria-hidden="true" />
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full block"
          aria-label="Waveform monitor"
        />
        <div className="absolute inset-y-0 left-1 flex flex-col justify-between pointer-events-none py-px">
          {["100", "75", "50", "25", "0"].map((v) => (
            <span key={v} className="text-[7px] font-mono text-white/25 leading-none">
              {v}
            </span>
          ))}
        </div>
        {blocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg">
            <span className="text-[9px] text-muted-foreground text-center px-3 leading-relaxed">
              Cross-origin video — scopes unavailable
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
