"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { cn } from "@/lib/utils";

type RGB = [number, number, number];

interface ColorWheelsProps {
  lift: RGB;
  gamma: RGB;
  gain: RGB;
  onChange: (updates: { lift?: RGB; gamma?: RGB; gain?: RGB }) => void;
  className?: string;
}

const WHEEL_SIZE = 110;
const DOT_RADIUS = 6;
const SCALE = 0.4; // max color push magnitude at wheel edge

// Convert dot canvas position → RGB push vector
function dotToRgb(nx: number, ny: number): RGB {
  const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
  const theta = Math.atan2(ny, nx);
  const r = Math.cos(theta) * d * SCALE;
  const g = Math.cos(theta - (2 * Math.PI) / 3) * d * SCALE;
  const b = Math.cos(theta - (4 * Math.PI) / 3) * d * SCALE;
  return [r, g, b];
}

// Convert RGB push vector → dot normalized position
function rgbToDot(rgb: RGB): [number, number] {
  const [r, g, b] = rgb;
  const nx = ((2 * r - g - b) / 3 / SCALE) * 1.5;
  const ny = ((g - b) / Math.sqrt(3) / SCALE) * 1.5;
  const len = Math.sqrt(nx * nx + ny * ny);
  if (len > 1) return [nx / len, ny / len];
  return [nx, ny];
}

function drawWheel(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const s = WHEEL_SIZE;
  canvas.width = s * dpr;
  canvas.height = s * dpr;
  canvas.style.width = `${s}px`;
  canvas.style.height = `${s}px`;
  ctx.scale(dpr, dpr);

  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2 - 2;

  // Clip to circle
  ctx.clearRect(0, 0, s, s);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Conic color spectrum
  const conic = ctx.createConicGradient(0, cx, cy);
  conic.addColorStop(0 / 6, "hsl(0,100%,50%)");
  conic.addColorStop(1 / 6, "hsl(60,100%,50%)");
  conic.addColorStop(2 / 6, "hsl(120,100%,50%)");
  conic.addColorStop(3 / 6, "hsl(180,100%,50%)");
  conic.addColorStop(4 / 6, "hsl(240,100%,50%)");
  conic.addColorStop(5 / 6, "hsl(300,100%,50%)");
  conic.addColorStop(6 / 6, "hsl(360,100%,50%)");
  ctx.fillStyle = conic;
  ctx.fillRect(0, 0, s, s);

  // Radial white center fade (saturation ramp)
  const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  radial.addColorStop(0, "rgba(255,255,255,1)");
  radial.addColorStop(0.5, "rgba(255,255,255,0.3)");
  radial.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, s, s);

  ctx.restore();

  // Border ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawDot(canvas: HTMLCanvasElement, nx: number, ny: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const s = WHEEL_SIZE;
  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2 - 2;
  const dx = cx + nx * r;
  const dy = cy + ny * r;

  ctx.clearRect(0, 0, s * dpr, s * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);
  drawWheelContent(ctx, cx, cy, r, s);

  // Cross-hair center marker
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4); ctx.stroke();

  // Dot shadow
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(dx, dy, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(dx, dy, DOT_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawWheelContent(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const conic = ctx.createConicGradient(0, cx, cy);
  conic.addColorStop(0 / 6, "hsl(0,100%,50%)");
  conic.addColorStop(1 / 6, "hsl(60,100%,50%)");
  conic.addColorStop(2 / 6, "hsl(120,100%,50%)");
  conic.addColorStop(3 / 6, "hsl(180,100%,50%)");
  conic.addColorStop(4 / 6, "hsl(240,100%,50%)");
  conic.addColorStop(5 / 6, "hsl(300,100%,50%)");
  conic.addColorStop(6 / 6, "hsl(360,100%,50%)");
  ctx.fillStyle = conic;
  ctx.fillRect(0, 0, s, s);
  const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  radial.addColorStop(0, "rgba(255,255,255,1)");
  radial.addColorStop(0.5, "rgba(255,255,255,0.3)");
  radial.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, s, s);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

interface SingleWheelProps {
  label: string;
  value: RGB;
  onChange: (rgb: RGB) => void;
}

function SingleWheel({ label, value, onChange }: SingleWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const [dot, setDot] = useState<[number, number]>(() => rgbToDot(value));

  // Redraw when value prop changes externally
  useEffect(() => {
    const nd = rgbToDot(value);
    setDot(nd);
  }, [value[0], value[1], value[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paint canvas whenever dot moves
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawDot(canvas, dot[0], dot[1]);
  }, [dot]);

  const getCanvasNormalized = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0] as [number, number];
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2 - 2;
    const nx = (e.clientX - cx) / r;
    const ny = (e.clientY - cy) / r;
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len > 1) return [nx / len, ny / len] as [number, number];
    return [nx, ny] as [number, number];
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      const nd = getCanvasNormalized(e);
      setDot(nd);
      onChange(dotToRgb(nd[0], nd[1]));
    },
    [getCanvasNormalized, onChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragging.current) return;
      const nd = getCanvasNormalized(e);
      setDot(nd);
      onChange(dotToRgb(nd[0], nd[1]));
    },
    [getCanvasNormalized, onChange]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleDoubleClick = useCallback(() => {
    setDot([0, 0]);
    onChange([0, 0, 0]);
  }, [onChange]);

  const lum = ((value[0] + value[1] + value[2]) / 3).toFixed(3);

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <canvas
        ref={canvasRef}
        className="rounded-full cursor-crosshair touch-none"
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        title="Drag to adjust color. Double-click to reset."
        aria-label={`${label} color wheel`}
      />
      {/* Luminance slider */}
      <div className="w-full flex flex-col gap-1">
        <input
          type="range"
          min={-0.5}
          max={0.5}
          step={0.01}
          value={lum}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange([v, v, v]);
          }}
          className="w-full h-1 accent-purple-500 cursor-pointer"
          aria-label={`${label} luminance`}
        />
      </div>
      {/* Numeric readout */}
      <div className="flex gap-1 text-[8px] font-mono tabular-nums">
        {(["R", "G", "B"] as const).map((ch, i) => (
          <span
            key={ch}
            className={cn(
              "px-1 py-0.5 rounded",
              i === 0 ? "text-red-400" : i === 1 ? "text-green-400" : "text-blue-400"
            )}
          >
            {ch}:{value[i] >= 0 ? "+" : ""}{value[i].toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ColorWheels({ lift, gamma, gain, onChange, className }: ColorWheelsProps) {
  return (
    <div className={cn("flex gap-3 justify-between", className)}>
      <SingleWheel
        label="Lift"
        value={lift}
        onChange={(rgb) => onChange({ lift: rgb })}
      />
      <SingleWheel
        label="Gamma"
        value={gamma}
        onChange={(rgb) => onChange({ gamma: rgb })}
      />
      <SingleWheel
        label="Gain"
        value={gain}
        onChange={(rgb) => onChange({ gain: rgb })}
      />
    </div>
  );
}
