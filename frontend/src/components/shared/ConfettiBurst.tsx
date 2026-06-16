"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";

const COLORS = ["#a855f7", "#ec4899", "#34d399", "#facc15", "#60a5fa"];

interface Particle {
  id: number;
  x: number;
  rotate: number;
  color: string;
  delay: number;
  size: number;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 360,
    rotate: Math.random() * 540 - 270,
    color: COLORS[i % COLORS.length],
    delay: Math.random() * 0.15,
    size: 6 + Math.random() * 6,
  }));
}

/**
 * Lightweight celebratory burst built on framer-motion (already a project
 * dependency) rather than pulling in a confetti package — see dependency
 * lock in CLAUDE.md.
 */
export function ConfettiBurst({ show }: { show: boolean }) {
  const particles = useMemo(() => makeParticles(28), [show]);

  return (
    <AnimatePresence>
      {show && (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 top-0 z-[100] flex justify-center pointer-events-none overflow-hidden h-screen"
        >
          {particles.map((p) => (
            <motion.span
              key={p.id}
              initial={{ x: 0, y: -20, opacity: 1, rotate: 0 }}
              animate={{ x: p.x, y: "70vh", opacity: 0, rotate: p.rotate }}
              transition={{ duration: 1.6, delay: p.delay, ease: "easeIn" }}
              style={{
                position: "absolute",
                top: 0,
                width: p.size,
                height: p.size * 0.4,
                backgroundColor: p.color,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
