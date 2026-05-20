"use client";

import { useFaceTracker } from "@/hooks/useFaceTracker";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function TelemetryDock() {
  const { isReady } = useFaceTracker();
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let lastTime = performance.now();
    let frameCount = 0;

    const loop = () => {
      const now = performance.now();
      frameCount++;

      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(loop);
    };

    const id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/[0.06] px-2.5 py-1 rounded-full">
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          fps > 58 && isReady ? "bg-emerald-400" : "bg-amber-400"
        )}
      />
      <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">
        {fps}fps · {isReady ? "vision" : "init"}
      </span>
    </div>
  );
}
