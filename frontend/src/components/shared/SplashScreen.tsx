"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";

const SESSION_FLAG = "qas_splash_shown";
const HOLD_MS = 1400;
const FADE_MS = 400;

export default function SplashScreen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_FLAG) === "1") return;

    setShow(true);
    sessionStorage.setItem(SESSION_FLAG, "1");

    const t = window.setTimeout(() => setShow(false), HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          style={{ background: "#000000" }}
        >
          {/* Ambient glow behind logo */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 420,
              height: 420,
              background:
                "radial-gradient(ellipse at center, rgba(59,130,246,0.18) 0%, rgba(168,85,247,0.12) 40%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />

          {/* Real brand logo — the PNG already includes the "QUICK AI SHORTS"
              wordmark, so we render it full without any crop here. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.82, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: 0.7,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative z-10"
          >
            <Image
              src="/qs-logo.png"
              alt="QuickAI Shorts"
              width={220}
              height={220}
              priority
              className="select-none"
              style={{ imageRendering: "auto" }}
              draggable={false}
            />
          </motion.div>

          {/* Progress bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="relative z-10 mt-8 h-[2px] w-44 overflow-hidden rounded-full bg-white/5"
          >
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: HOLD_MS / 1000, ease: "linear" }}
              className="h-full"
              style={{
                background:
                  "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
