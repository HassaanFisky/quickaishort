"use client";

import { useRef, useEffect, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";

const SIZE = 120;

const COLOR_TARGETS: Array<{ label: string; angle: number; color: string }> = [
  { label: "R",  angle: 103.8, color: "#ef4444" },
  { label: "Mg", angle: 61,    color: "#ec4899" },
  { label: "B",  angle: 346.8, color: "#3b82f6" },
  { label: "Cy", angle: 283.8, color: "#22d3ee" },
  { label: "G",  angle: 163.8, color: "#22c55e" },
  { label: "Yl", angle: 226.8, color: "#facc15" },
];

function drawVectorscope(ctx: CanvasRenderingContext2D, imageData: ImageData, size: number) {
  ctx.fillStyle = "rgb(10,10,10)";
  ctx.fillRect(0, 0, size, size);

  const center = size / 2;
  const radius = center * 0.85;

  // Graticule circles
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (const r of [0.33, 0.66, 1]) {
    ctx.beginPath();
    ctx.arc(center, center, radius * r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crosshairs
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath(); ctx.moveTo(center, center - radius); ctx.lineTo(center, center + radius); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(center - radius, center); ctx.lineTo(center + radius, center); ctx.stroke();

  // Color target markers
  for (const { label, angle, color } of COLOR_TARGETS) {
    const rad = (angle * Math.PI) / 180;
    const tx = center + Math.cos(rad) * radius * 0.75;
    const ty = center - Math.sin(rad) * radius * 0.75;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx - 3, ty - 3, 6, 6);
    ctx.fillStyle = color;
    ctx.font = "6px monospace";
    ctx.fillText(label, tx + 4, ty + 3);
  }

  // Plot pixels
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 8) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const x = center + ((cb - 128) / 128) * radius;
    const y = center - ((cr - 128) / 128) * radius;
    ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
    ctx.fillRect(x, y, 1, 1);
  }
}

export default function Vectorscope({ className }: { className?: string }) {
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
        drawVectorscope(ctx, imageData, SIZE);
        setBlocked(false);
      } catch {
        setBlocked(true);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [storeRef]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn("flex-shrink-0", className)}>
      <div
        className="relative rounded-full overflow-hidden bg-[#0a0a0a] border border-border"
        style={{ width: SIZE, height: SIZE }}
      >
        <canvas ref={scratchRef} className="hidden" aria-hidden="true" />
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="block"
          aria-label="Vectorscope"
        />
        {blocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-full">
            <span className="text-[8px] text-muted-foreground text-center px-2">N/A</span>
          </div>
        )}
      </div>
    </div>
  );
}
