"use client";

import React from "react";

interface TimeRulerProps {
  pps: number;
  duration: number;
}

export function TimeRuler({ pps, duration }: TimeRulerProps) {
  // Determine tick interval based on pps
  let interval = 1;
  if (pps < 10) interval = 10;
  if (pps < 20) interval = 5;
  if (pps > 100) interval = 0.5;
  if (pps > 200) interval = 0.1;

  const ticks = [];
  const totalWidth = Math.max(duration * pps, 2000);

  for (let t = 0; t <= totalWidth / pps; t += interval) {
    ticks.push(t);
  }

  return (
    <div
      className="sticky top-0 h-6 bg-neutral-800/80 border-b border-neutral-700 z-20 flex items-end pointer-events-none"
      style={{ width: `${totalWidth}px` }}
    >
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute border-l border-neutral-600 h-2 flex flex-col justify-end"
          style={{ left: `${t * pps}px` }}
        >
          {t % (interval * 5) === 0 && (
            <span className="absolute bottom-3 left-1 text-[9px] text-neutral-500 font-mono">
              {Math.floor(t)}s
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
