"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

/**
 * CinematicIntro Component
 * Replicates the premium intro from intro.html using React and Framer Motion.
 */
export const CinematicIntro = ({ onComplete }: { onComplete: () => void }) => {
  const [phase, setPhase] = useState<"entry" | "hold" | "sweep" | "end">("entry");
  const logoWrapRef = useRef<HTMLDivElement>(null);
  const textWrapRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Constants from intro.html
  const T_ENTRY = 1000;
  const T_HOLD = 600;
  const T_SWEEP = 1300;

  const playSound = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const duration = 0.8;
      const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const source = ctx.createBufferSource();
      source.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(1500, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch (e) {
      console.error("Audio error:", e);
    }
  };

  useEffect(() => {
    // Phase transitions
    if (phase === "entry") {
      const timer = setTimeout(() => setPhase("hold"), T_ENTRY);
      return () => clearTimeout(timer);
    } else if (phase === "hold") {
      const timer = setTimeout(() => {
        setPhase("sweep");
        playSound();
      }, T_HOLD);
      return () => clearTimeout(timer);
    } else if (phase === "sweep") {
      const timer = setTimeout(() => setPhase("end"), T_SWEEP);
      return () => clearTimeout(timer);
    } else if (phase === "end") {
      const timer = setTimeout(() => onComplete(), 500);
      return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  // Handle the text wipe effect during sweep
  useEffect(() => {
    if (phase !== "sweep") return;

    let frame: number;
    const updateWipe = () => {
      if (logoWrapRef.current && textWrapRef.current) {
        const lr = logoWrapRef.current.getBoundingClientRect();
        const tr = textWrapRef.current.getBoundingClientRect();
        const bladePos = lr.left + lr.width / 2;
        const erased = Math.max(0, Math.min(tr.width, bladePos - tr.left));
        textWrapRef.current.style.clipPath = `inset(0 0 0 ${erased}px)`;
      }
      frame = requestAnimationFrame(updateWipe);
    };

    frame = requestAnimationFrame(updateWipe);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#08080a] flex items-center justify-center overflow-hidden">
      {/* Cinematic Background Blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ 
            translate: ["0% 0%", "5% 5%"],
            scale: [1, 1.1]
          }}
          transition={{ duration: 25, repeat: Infinity, repeatType: "alternate", ease: "easeInOut" }}
          className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] bg-[#a855f7] rounded-full blur-[140px] opacity-15"
        />
        <motion.div
          animate={{ 
            translate: ["0% 0%", "-5% -5%"],
            scale: [1, 1.1]
          }}
          transition={{ duration: 25, repeat: Infinity, repeatType: "alternate", ease: "easeInOut", delay: 1 }}
          className="absolute -bottom-[5%] -right-[5%] w-[45vw] h-[45vw] bg-[#3b82f6] rounded-full blur-[140px] opacity-15"
        />
      </div>

      <div className="relative flex items-center justify-center">
        {/* Logo and Trail Container */}
        <motion.div
          ref={logoWrapRef}
          initial={{ opacity: 0, x: -40, y: 40 }}
          animate={
            phase === "entry" ? { opacity: 1, x: 0, y: 0 } :
            phase === "sweep" ? { x: "100vw" } :
            { opacity: 1, x: 0, y: 0 }
          }
          transition={{
            opacity: { duration: T_ENTRY / 1000 },
            x: { 
              duration: phase === "sweep" ? T_SWEEP / 1000 : T_ENTRY / 1000,
              ease: phase === "sweep" ? [0.645, 0.045, 0.355, 1] : "easeOut"
            },
            y: { duration: T_ENTRY / 1000, ease: "easeOut" }
          }}
          className="absolute z-20 flex items-center justify-center"
          style={{ 
            left: phase === "entry" || phase === "hold" ? "-130px" : undefined,
            filter: "drop-shadow(0 0 30px rgba(168, 85, 247, 0.4))" 
          }}
        >
          <div className="relative">
            <Image
              src="/qs-logo-optimized.png"
              alt="Logo"
              width={120}
              height={120}
              className="h-[clamp(80px,10vh,120px)] w-auto"
              priority
            />
            {/* Light Trail */}
            <AnimatePresence>
              {phase === "sweep" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-1/2 left-1/2 -translate-y-1/2 w-[120px] h-[2px] rounded-full blur-[4px] pointer-events-none"
                  style={{
                    background: "linear-gradient(90deg, transparent, #a855f7, #3b82f6, transparent)",
                    transform: "translateX(-150%)"
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Headline Text */}
        <div className="relative">
          <motion.div
            ref={textWrapRef}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ 
              opacity: phase === "entry" || phase === "hold" || phase === "sweep" ? 1 : 0,
              scale: phase === "entry" ? 1 : 1 
            }}
            transition={{ duration: T_ENTRY / 1000 }}
            className="text-[clamp(2.2rem,5vw,5.5rem)] font-black tracking-tight uppercase whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-[#3b82f6] via-[#a855f7] to-[#ec4899]"
          >
            QUICK AI SHORTS
          </motion.div>
        </div>
      </div>
    </div>
  );
};
