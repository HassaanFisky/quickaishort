"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { WebGpuCompositor } from "@/lib/webgpu/compositor";
import { getFlag } from "@/lib/featureFlags";
import { getPreviewContextFromManifest } from "@/lib/render/renderManifestPreviewContext";

const FPS_30_MS = 1000 / 30;

export function WebGpuPreviewLayer() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<WebGpuCompositor | null>(null);
  const rafRef = useRef<number | null>(null);
  const videoRef = useEditorStore((s) => s.videoElementRef);
  const compiledManifest = useEditorStore((s) => s.compiledManifest);
  const timelineRevision = useEditorStore((s) => s.timelineRevision);

  // Phase 51 keeps the current single-frame WebGPU draw path; manifest ref prepares future multi-layer parity.
  const latestManifestRef = useRef(compiledManifest);
  const previewContextRef = useRef(getPreviewContextFromManifest(compiledManifest));
  useEffect(() => {
    latestManifestRef.current = compiledManifest;
    previewContextRef.current = getPreviewContextFromManifest(compiledManifest);
  }, [timelineRevision, compiledManifest]);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Check IndexedDB flag + WebGPU support on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getFlag("webgpu-preview"),
      WebGpuCompositor.isSupported(),
    ]).then(([flag, gpuOk]) => {
      if (!cancelled) {
        setEnabled(flag);
        setSupported(gpuOk);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const compositor = compositorRef.current;
    const video = videoRef?.current;
    if (!canvas || !compositor || !video) return;

    let lastTime = 0;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      // prefers-reduced-motion: cap to 30 fps
      if (prefersReducedMotion && now - lastTime < FPS_30_MS) return;
      lastTime = now;
      if (video.readyState >= 2 && !video.paused) {
        compositor.drawVideoFrame(video).catch(() => {});
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [videoRef, prefersReducedMotion]);

  // Init compositor when feature flag is on and WebGPU is available
  useEffect(() => {
    if (!enabled || !supported) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const compositor = new WebGpuCompositor();
    compositorRef.current = compositor;

    compositor
      .init(canvas)
      .then(() => {
        startLoop();
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.warn("[WebGPU] compositor init failed:", err);
        compositorRef.current = null;
      });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      compositor.dispose();
      compositorRef.current = null;
    };
  }, [enabled, supported, startLoop]);

  if (!enabled || !supported) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] w-full h-full"
    />
  );
}
