"use client";

import { useFaceTracker } from "@/hooks/useFaceTracker";
import { Activity, Cpu, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";

export function TelemetryDock() {
  const { isReady, reframingData } = useFaceTracker();
  const [fps, setFps] = useState(0);

  // Mock CPU usage based on frame delta
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
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3">
      <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-[10px] uppercase font-mono text-muted-foreground shadow-2xl">
        <Cpu className="w-3 h-3 text-blue-400" />
        <span>CORE: {fps > 58 ? "IDLE" : "BUSY"}</span>
        <span className="text-white ml-1">{fps} FPS</span>
      </div>

      <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-[10px] uppercase font-mono text-muted-foreground shadow-2xl">
        <ScanFace
          className={`w-3 h-3 ${isReady ? "text-green-400" : "text-yellow-400"}`}
        />
        <span>VISION: {isReady ? "ONLINE" : "INIT"}</span>
        {reframingData?.faceDetected && (
          <span className="text-white ml-1">
            CONF: {reframingData.boundingBox ? "HIGH" : "OK"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-[10px] uppercase font-mono text-muted-foreground shadow-2xl">
        <Activity className="w-3 h-3 text-pink-400" />
        <span>V.MEM: 240MB</span>
      </div>
    </div>
  );
}
