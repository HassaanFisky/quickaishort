"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import QSLogo from "./QSLogo";

const SESSION_FLAG = "qas_splash_shown";
const HOLD_MS = 1200;
const FADE_MS = 300;

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
          style={{ background: "var(--bg-base, #08080a)" }}
        >
          <QSLogo variant="full" size="xl" animated />
          <div className="mt-12 h-[2px] w-56 overflow-hidden rounded-full bg-white/5">
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
