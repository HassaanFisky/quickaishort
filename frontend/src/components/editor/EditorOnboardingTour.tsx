"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { saveOnboarding } from "@/lib/studio/onboarding";

const STEPS: { id: string; sentence: string }[] = [
  { id: "ingest.upload", sentence: "Upload a video from your device." },
  { id: "ingest.url", sentence: "Or paste a YouTube link." },
  { id: "ai.suggestions", sentence: "AI suggests edits from your video." },
  { id: "ai.chat", sentence: "Tell the AI what to change." },
  { id: "timeline.dock", sentence: "Your edits show up here." },
  { id: "export.button", sentence: "Export when you’re happy." },
];

interface EditorOnboardingTourProps {
  initialStep?: number;
  onFinished: () => void;
}

/**
 * EP-008 — Lazy-loaded interactive spotlight tour.
 */
export default function EditorOnboardingTour({
  initialStep = 0,
  onFinished,
}: EditorOnboardingTourProps) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(initialStep);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    const id = STEPS[step]?.id;
    if (!id) return;
    const el = document.querySelector(`[data-tour-id="${id}"]`);
    if (el) setRect(el.getBoundingClientRect());
    else setRect(null);
  }, [step]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useEffect(() => {
    void saveOnboarding("in_progress", step);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish("skipped");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (status: "completed" | "skipped") => {
    await saveOnboarding(status, step);
    onFinished();
  };

  const pad = 8;
  const r = rect
    ? {
        top: Math.max(8, rect.top - pad),
        left: Math.max(8, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label="Editor tour"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-hidden />

      {r && (
        <motion.div
          className="absolute rounded-xl ring-2 ring-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none"
          style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
          initial={reduceMotion ? false : { opacity: 0.6 }}
          animate={{ opacity: 1 }}
        />
      )}

      {!reduceMotion && r && (
        <motion.div
          className="absolute w-3 h-3 rounded-full bg-primary pointer-events-none"
          style={{
            top: r.top + r.height + 10,
            left: r.left + Math.min(24, r.width / 2),
          }}
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.1 }}
          aria-hidden
        />
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[min(420px,92vw)] rounded-2xl border border-white/[0.08] bg-[hsl(var(--bg-elevated))] p-4 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
          {step + 1} / {STEPS.length}
        </p>
        <p className="text-sm font-semibold text-foreground mb-4">
          {STEPS[step]?.sentence}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="h-9 px-3 rounded-xl border border-border text-xs font-bold disabled:opacity-40"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-xl border border-border text-xs font-bold text-muted-foreground"
            onClick={() => void finish("skipped")}
          >
            Skip
          </button>
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
              onClick={() => setStep((s) => s + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
              onClick={() => void finish("completed")}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
