"use client";

import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link2, Sparkles, Rocket, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Persisted once per browser (not per session like the splash) — a returning
// user should never see the tour again. If localStorage is blocked we silently
// skip the tour rather than risk throwing on read/write.
const STORAGE_FLAG = "qas_editor_tour_done";

type Step = {
  icon: typeof Link2;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: Link2,
    title: "Paste a YouTube link",
    body: "Drop a URL in the bar up top and hit Generate. The AI downloads the video, transcribes it right in your browser, and scores the most viral moments — no upload needed.",
  },
  {
    icon: Sparkles,
    title: "Pick your viral clips",
    body: "The left panel ranks moments by viral score. Click any clip to load it on the stage, then trim, caption, and style it from the properties panel on the right.",
  },
  {
    icon: Rocket,
    title: "Pre-Flight, then export",
    body: "Before you publish, run Pre-Flight to simulate six audience personas and predict retention. Happy with the score? Export your short straight from the right panel.",
  },
];

export default function OnboardingTour() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(STORAGE_FLAG) === "1") return;
    } catch {
      return; // storage blocked — skip the tour entirely
    }
    setShow(true);
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_FLAG, "1");
    } catch {
      /* best-effort persistence — ignore */
    }
  }, []);

  const next = useCallback(() => {
    setStep((s) => {
      if (s >= STEPS.length - 1) {
        dismiss();
        return s;
      }
      return s + 1;
    });
  }, [dismiss]);

  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, dismiss, next, back]);

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="tour-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
        >
          <motion.div
            key={`tour-card-${step}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 240 }}
            className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={dismiss}
              aria-label="Skip tour"
              className="absolute right-4 top-4 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
            >
              <X size={15} />
            </button>

            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5">
              <Icon className="w-5 h-5" />
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted mb-2">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 id="tour-title" className="text-lg font-bold text-foreground mb-2">
              {current.title}
            </h2>
            <p className="text-sm text-fg-muted leading-relaxed mb-6">
              {current.body}
            </p>

            <div className="flex items-center justify-between">
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === step ? "w-5 bg-primary" : "w-1.5 bg-foreground/15"
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    onClick={back}
                    className="h-9 px-3 rounded-lg text-[11px] font-black uppercase tracking-widest text-fg-muted hover:text-foreground transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={next}
                  autoFocus
                  className="h-9 px-4 rounded-lg bg-primary text-white text-[11px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                >
                  {isLast ? "Start creating" : "Next"}
                  {isLast && <Rocket className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
