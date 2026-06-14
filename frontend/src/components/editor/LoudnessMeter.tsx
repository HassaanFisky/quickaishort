"use client";

import { useRef, useEffect, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";

export default function LoudnessMeter() {
  const videoElementRef = useEditorStore((s) => s.videoElementRef);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [dbfs, setDbfs] = useState<number>(-60);

  useEffect(() => {
    const video = videoElementRef?.current;
    if (!video) return;

    try {
      if (!audioCtxRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (!sourceRef.current) {
        sourceRef.current = ctx.createMediaElementSource(video);
      }
      if (!analyserRef.current) {
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 256;
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      }
    } catch {
      // CORS or already-connected source — meter stays silent
    }

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [videoElementRef]);

  useEffect(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const data = new Float32Array(analyser.fftSize);
    const ctx2d = canvas.getContext("2d");

    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      if (!isPlaying) return;
      if (!ctx2d) return;

      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -60;
      const clamped = Math.max(-60, Math.min(0, db));
      setDbfs(clamped);

      const W = canvas.width;
      const H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);

      const pct = (clamped + 60) / 60;
      const fillH = pct * H;
      const color = clamped > -6 ? "#ef4444" : clamped > -18 ? "#f59e0b" : "#22c55e";
      ctx2d.fillStyle = "rgba(255,255,255,0.04)";
      ctx2d.fillRect(0, 0, W, H);
      ctx2d.fillStyle = color;
      ctx2d.fillRect(0, H - fillH, W, fillH);

      // Tick marks
      [-6, -12, -18, -24, -36].forEach((mark) => {
        const y = H - ((mark + 60) / 60) * H;
        ctx2d.strokeStyle = "rgba(255,255,255,0.25)";
        ctx2d.lineWidth = 0.5;
        ctx2d.beginPath();
        ctx2d.moveTo(0, y); ctx2d.lineTo(W, y);
        ctx2d.stroke();
      });
    };

    tick();
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
        Loudness
      </span>
      <div className="flex items-end gap-1">
        <canvas
          ref={canvasRef}
          width={12}
          height={80}
          style={{ width: 12, height: 80, borderRadius: 3 }}
          aria-label="Loudness meter"
        />
        <canvas
          ref={canvasRef}
          width={12}
          height={80}
          style={{ width: 12, height: 80, borderRadius: 3 }}
          aria-hidden
        />
      </div>
      <span
        className="text-[8px] tabular-nums font-mono"
        style={{ color: dbfs > -6 ? "#ef4444" : dbfs > -18 ? "#f59e0b" : "#22c55e" }}
      >
        {dbfs.toFixed(1)} dBFS
      </span>
    </div>
  );
}
