"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import {
  getTrack,
  upsertKeyframe,
  deleteKeyframe as storeDeleteKf,
  getMotionPath,
} from "@/lib/motion/keyframeStore";
import { interpolateTrack } from "@/lib/motion/keyframeTypes";
import type { Keyframe } from "@/lib/motion/keyframeTypes";

// Canvas geometry constants
const CW = 360;
const CH = 120;
const PX = 18; // left padding — room for Y labels
const PY = 8;
const DW = CW - PX - 8;  // drawable width
const DH = CH - 2 * PY;  // drawable height

// Speed range
const MIN_SPEED = 0.25;
const MAX_SPEED = 4.0;
const DEFAULT_SPEED = 1.0;
const KF_R = 5; // keyframe dot radius

// ─── Coordinate helpers ────────────────────────────────────────────────────

function speedToY(s: number): number {
  const norm = (s - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);
  return PY + (1 - norm) * DH;
}

function yToSpeed(y: number): number {
  const norm = 1 - (y - PY) / DH;
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, MIN_SPEED + norm * (MAX_SPEED - MIN_SPEED)));
}

function timeToX(ms: number, durMs: number): number {
  return PX + Math.max(0, Math.min(1, ms / durMs)) * DW;
}

function xToMs(x: number, durMs: number): number {
  return Math.round(Math.max(0, Math.min(1, (x - PX) / DW)) * durMs);
}

function hitKf(kfs: Keyframe[], x: number, y: number, durMs: number): Keyframe | null {
  for (const kf of kfs) {
    const kx = timeToX(kf.timeMs, durMs);
    const ky = speedToY(kf.value);
    if (Math.hypot(x - kx, y - ky) <= KF_R + 4) return kf;
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function SpeedRampEditor() {
  const { selectedClipId, suggestions, currentTime } = useEditorStore();

  const clip = selectedClipId
    ? (suggestions.find((c) => c.id === selectedClipId) ?? suggestions[0])
    : suggestions[0];

  const durMs  = clip ? (clip.end - clip.start) * 1000 : 0;
  const clipStart = clip ? clip.start : 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging  = useRef<string | null>(null); // id of keyframe being dragged

  const [kfs,   setKfs]   = useState<Keyframe[]>([]);
  const [selId, setSelId] = useState<string | null>(null);

  // Re-init when clip selection changes
  useEffect(() => {
    if (!clip) { setKfs([]); setSelId(null); return; }
    const track = getTrack(clip.id, "speed");
    setKfs(track ? [...track.keyframes] : []);
    setSelId(null);
    dragging.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id]);

  // ─── Canvas draw ──────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || durMs <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CW, CH);

    // Background
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.roundRect(0, 0, CW, CH, 6);
    ctx.fill();

    const oneY   = speedToY(DEFAULT_SPEED);
    const hasKfs = kfs.length > 0;
    const track  = { property: "speed" as const, keyframes: kfs };

    // Compute curve Y values for every pixel column
    const ys: number[] = [];
    for (let i = 0; i <= DW; i++) {
      const ms = xToMs(PX + i, durMs);
      ys.push(hasKfs ? speedToY(interpolateTrack(track, ms)) : oneY);
    }

    // Gradient fills above / below 1× line
    for (let i = 0; i <= DW; i++) {
      const x = PX + i;
      const cy = ys[i];
      if (cy < oneY) {
        // faster than 1× → emerald tint
        ctx.fillStyle = "rgba(52,211,153,0.09)";
        ctx.fillRect(x, cy, 1, oneY - cy);
      } else if (cy > oneY) {
        // slower than 1× → amber tint
        ctx.fillStyle = "rgba(245,158,11,0.09)";
        ctx.fillRect(x, oneY, 1, cy - oneY);
      }
    }

    // 1× reference dashed line
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PX, oneY);
    ctx.lineTo(CW - 6, oneY);
    ctx.stroke();
    ctx.restore();

    // Speed curve
    ctx.strokeStyle = hasKfs ? "rgba(168,85,247,0.88)" : "rgba(255,255,255,0.16)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(PX, ys[0]);
    for (let i = 1; i <= DW; i++) ctx.lineTo(PX + i, ys[i]);
    ctx.stroke();

    // Y-axis speed labels
    ctx.fillStyle  = "rgba(255,255,255,0.22)";
    ctx.font       = "8px monospace";
    ctx.textAlign  = "left";
    ([ [MAX_SPEED, "4×"], [2.0, "2×"], [DEFAULT_SPEED, "1×"], [0.5, "½×"], [MIN_SPEED, "¼×"] ] as [number, string][])
      .forEach(([s, lbl]) => ctx.fillText(lbl, 1, speedToY(s) + 3));

    // Playhead vertical line
    const relSec = currentTime - clipStart;
    if (clip && relSec >= 0 && relSec * 1000 <= durMs) {
      const phX = timeToX(relSec * 1000, durMs);
      ctx.save();
      ctx.strokeStyle = "rgba(168,85,247,0.42)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(phX, PY);
      ctx.lineTo(phX, CH - PY);
      ctx.stroke();
      ctx.restore();
    }

    // Keyframe dots
    kfs.forEach((kf) => {
      const x   = timeToX(kf.timeMs, durMs);
      const y   = speedToY(kf.value);
      const sel = kf.id === selId;
      ctx.beginPath();
      ctx.arc(x, y, KF_R, 0, Math.PI * 2);
      ctx.fillStyle   = sel ? "#a855f7" : "rgba(168,85,247,0.62)";
      ctx.fill();
      ctx.strokeStyle = sel ? "#ffffff" : "rgba(255,255,255,0.42)";
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    });
  }, [kfs, selId, durMs, clipStart, currentTime, clip]);

  useEffect(() => { draw(); }, [draw]);

  // ─── Event helpers ─────────────────────────────────────────────────────

  const coords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CW / rect.width),
      y: (e.clientY - rect.top)  * (CH / rect.height),
    };
  };

  // ─── Mouse handlers ────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!clip) return;
    const { x, y } = coords(e);
    const kf = hitKf(kfs, x, y, durMs);
    if (kf) {
      setSelId(kf.id);
      dragging.current = kf.id;
      e.preventDefault();
    } else {
      setSelId(null);
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging.current || !clip) return;
    const { x, y } = coords(e);
    const id = dragging.current;
    const newMs    = xToMs(x, durMs);
    const newSpeed = yToSpeed(y);
    upsertKeyframe(clip.id, "speed", {
      id, timeMs: newMs, value: newSpeed, easing: { type: "ease-in-out" },
    });
    setKfs((prev) =>
      prev.map((kf) => kf.id === id ? { ...kf, timeMs: newMs, value: newSpeed } : kf)
          .sort((a, b) => a.timeMs - b.timeMs)
    );
  };

  const onMouseUp = () => { dragging.current = null; };

  const onDblClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!clip) return;
    const { x, y } = coords(e);
    const ms    = xToMs(x, durMs);
    const speed = yToSpeed(y);
    const id    = `speed-${Date.now()}`;
    const newKf: Keyframe = { id, timeMs: ms, value: speed, easing: { type: "ease-in-out" } };
    upsertKeyframe(clip.id, "speed", newKf);
    setKfs((prev) => [...prev, newKf].sort((a, b) => a.timeMs - b.timeMs));
    setSelId(id);
  };

  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!clip) return;
    const { x, y } = coords(e);
    const kf = hitKf(kfs, x, y, durMs);
    if (!kf) return;
    storeDeleteKf(clip.id, "speed", kf.id);
    setKfs((prev) => prev.filter((k) => k.id !== kf.id));
    if (selId === kf.id) setSelId(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selId && clip) {
      storeDeleteKf(clip.id, "speed", selId);
      setKfs((prev) => prev.filter((k) => k.id !== selId));
      setSelId(null);
    }
  };

  const onClear = () => {
    if (!clip) return;
    // Remove only the speed track, preserving other property tracks
    const path = getMotionPath(clip.id);
    if (path) path.tracks = path.tracks.filter((t) => t.property !== "speed");
    setKfs([]);
    setSelId(null);
  };

  // Speed at current playhead position
  const currentSpeed = (() => {
    if (kfs.length === 0) return DEFAULT_SPEED;
    const relMs = (currentTime - clipStart) * 1000;
    return interpolateTrack({ property: "speed", keyframes: kfs }, relMs);
  })();

  // ─── Render ────────────────────────────────────────────────────────────

  if (!clip) {
    return (
      <p className="text-[9px] text-muted-foreground text-center py-3">
        Select a clip to edit its speed ramp
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Playhead speed readout */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
          Playhead Speed
        </span>
        <span className="text-[11px] font-black tabular-nums text-primary">
          {currentSpeed.toFixed(2)}×
        </span>
      </div>

      {/* Curve canvas */}
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDblClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        tabIndex={0}
        aria-label="Speed ramp curve editor. Double-click to add a keyframe. Right-click or press Delete to remove."
        className="w-full rounded-lg border border-border cursor-crosshair outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
        style={{ touchAction: "none" }}
      />

      {/* Hint bar */}
      <div className="flex items-center justify-between">
        <p className="text-[8px] text-muted-foreground leading-relaxed">
          Double-click to add · Right-click or Delete to remove
        </p>
        {kfs.length > 0 && (
          <button
            onClick={onClear}
            aria-label="Reset speed ramp"
            className="h-6 px-2.5 rounded-md bg-muted border border-border text-[8px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Speed legend */}
      <div className="flex justify-between text-[8px] font-bold text-muted-foreground/70 px-1">
        <span>¼× slow</span>
        <span>1× normal</span>
        <span>4× fast</span>
      </div>
    </div>
  );
}
