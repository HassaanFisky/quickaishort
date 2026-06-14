"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

type Channel = "master" | "red" | "green" | "blue";

interface ControlPoint {
  x: number;
  y: number;
}

interface Props {
  onChange?: (channel: Channel, points: ControlPoint[]) => void;
  className?: string;
}

const DEFAULT_POINTS: ControlPoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

const CHANNEL_COLORS: Record<Channel, string> = {
  master: "#a855f7",
  red:    "#ef4444",
  green:  "#22c55e",
  blue:   "#3b82f6",
};

function catmullRom(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );
}

function drawCurve(ctx: CanvasRenderingContext2D, pts: ControlPoint[], color: string, w: number, h: number) {
  if (pts.length < 2) return;
  const sorted = [...pts].sort((a, b) => a.x - b.x);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  for (let px = 0; px <= w; px++) {
    const t = px / w;
    let y = t;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t >= sorted[i].x && t <= sorted[i + 1].x) {
        const p0 = sorted[Math.max(0, i - 1)];
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        const p3 = sorted[Math.min(sorted.length - 1, i + 2)];
        const segT = (t - p1.x) / (p2.x - p1.x + 1e-9);
        y = catmullRom(p0, p1, p2, p3, segT);
        break;
      }
    }
    const canvasY = h - Math.max(0, Math.min(1, y)) * h;
    if (px === 0) ctx.moveTo(px, canvasY);
    else ctx.lineTo(px, canvasY);
  }
  ctx.stroke();
}

export default function CurvesEditor({ onChange, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const SIZE = 160;

  const [channel, setChannel] = useState<Channel>("master");
  const [allPoints, setAllPoints] = useState<Record<Channel, ControlPoint[]>>({
    master: [...DEFAULT_POINTS],
    red:    [...DEFAULT_POINTS],
    green:  [...DEFAULT_POINTS],
    blue:   [...DEFAULT_POINTS],
  });
  const [dragging, setDragging] = useState<number | null>(null);

  const pts = allPoints[channel];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#0e0e11";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * SIZE / 4, 0); ctx.lineTo(i * SIZE / 4, SIZE);
      ctx.moveTo(0, i * SIZE / 4); ctx.lineTo(SIZE, i * SIZE / 4);
      ctx.stroke();
    }

    // Identity diagonal
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, SIZE); ctx.lineTo(SIZE, 0);
    ctx.stroke();

    // Draw all channel curves faintly
    (["master", "red", "green", "blue"] as Channel[]).forEach((ch) => {
      if (ch === channel) return;
      const alpha = "40";
      drawCurve(ctx, allPoints[ch], CHANNEL_COLORS[ch] + alpha, SIZE, SIZE);
    });

    // Active curve
    drawCurve(ctx, pts, CHANNEL_COLORS[channel], SIZE, SIZE);

    // Control points
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x * SIZE, SIZE - p.y * SIZE, 4, 0, Math.PI * 2);
      ctx.fillStyle = CHANNEL_COLORS[channel];
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, [pts, allPoints, channel]);

  useEffect(() => { draw(); }, [draw]);

  const getPoint = (e: React.MouseEvent | MouseEvent): ControlPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const p = getPoint(e);
    const hitIdx = pts.findIndex((cp) => {
      const dx = (cp.x - p.x) * SIZE;
      const dy = (cp.y - p.y) * SIZE;
      return Math.sqrt(dx * dx + dy * dy) < 8;
    });
    if (hitIdx !== -1) {
      setDragging(hitIdx);
      return;
    }
    const next = [...pts, p].sort((a, b) => a.x - b.x);
    const newAll = { ...allPoints, [channel]: next };
    setAllPoints(newAll);
    onChange?.(channel, next);
  };

  useEffect(() => {
    if (dragging === null) return;
    const onMove = (e: MouseEvent) => {
      const p = getPoint(e);
      setAllPoints((prev) => {
        const next = prev[channel].map((cp, i) => (i === dragging ? p : cp));
        onChange?.(channel, next);
        return { ...prev, [channel]: next };
      });
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, channel]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    const p = getPoint(e);
    const hitIdx = pts.findIndex((cp) => {
      const dx = (cp.x - p.x) * SIZE;
      const dy = (cp.y - p.y) * SIZE;
      return Math.sqrt(dx * dx + dy * dy) < 8;
    });
    if (hitIdx !== -1 && pts.length > 2) {
      const next = pts.filter((_, i) => i !== hitIdx);
      setAllPoints((prev) => ({ ...prev, [channel]: next }));
      onChange?.(channel, next);
    }
  };

  const resetChannel = () => {
    const next = [...DEFAULT_POINTS];
    setAllPoints((prev) => ({ ...prev, [channel]: next }));
    onChange?.(channel, next);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Channel tabs */}
      <div className="flex gap-1 p-0.5 bg-muted rounded-lg border border-border">
        {(["master", "red", "green", "blue"] as Channel[]).map((ch) => (
          <button
            key={ch}
            onClick={() => setChannel(ch)}
            aria-pressed={channel === ch}
            className={cn(
              "flex-1 h-6 rounded-md text-[8px] font-black uppercase transition-colors",
              channel === ch ? "bg-background text-foreground" : "text-fg-muted hover:text-foreground"
            )}
            style={channel === ch ? { color: CHANNEL_COLORS[ch] } : undefined}
          >
            {ch === "master" ? "M" : ch[0].toUpperCase()}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{ width: SIZE, height: SIZE, cursor: "crosshair", borderRadius: 6 }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        aria-label="RGB curves editor"
      />

      <div className="flex items-center justify-between">
        <p className="text-[8px] text-fg-muted">Click to add · Dbl-click to remove</p>
        <button
          onClick={resetChannel}
          className="text-[8px] font-bold text-fg-muted hover:text-foreground transition-colors uppercase"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
