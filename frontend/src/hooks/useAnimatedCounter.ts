"use client";

import { useEffect, useState } from "react";

/**
 * Animates a numeric value from 0 to `target` over `duration` ms using a
 * cubic ease-out curve. Pass `start = false` to defer the animation until
 * a gate condition becomes true (e.g. scroll-into-view). Used for viral
 * score reveals and landing page stat counters.
 */
export function useAnimatedCounter(
  target: number,
  duration = 1500,
  start = true,
): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };

    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration]);

  return value;
}
