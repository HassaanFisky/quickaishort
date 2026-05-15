"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Fades page content in on every route change.
 *
 * Implementation: a `motion.div` keyed on `pathname`. When the URL changes,
 * React unmounts the old wrapper and mounts a new one with `opacity: 0 → 1`
 * over 280ms (var(--motion-4) equivalent). No exit animation is used so the
 * new route is never visually delayed waiting on the old route to leave.
 *
 * Children may remain Server Components — Next.js's children-as-props pattern
 * allows a client wrapper to receive server-rendered output without forcing
 * the descendants into the client boundary.
 *
 * Reduced motion: the global CSS rule in globals.css collapses
 * transition-duration to 0.01ms under `prefers-reduced-motion: reduce`,
 * which also flattens framer-motion's CSS-transition-based animations.
 * As an additional safeguard the duration here is short enough to be
 * imperceptible if the global rule does not apply.
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
