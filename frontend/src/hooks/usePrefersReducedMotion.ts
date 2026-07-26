"use client";

import { useReducedMotion } from "framer-motion";

/** Canonical reduced-motion flag for Studio UI (Framer + CSS). */
export function usePrefersReducedMotion(): boolean {
  return Boolean(useReducedMotion());
}
