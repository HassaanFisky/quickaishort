"use client";

import React, { useRef } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const THEMES = [
  {
    id: "dark",
    name: "Midnight",
    color: "#a855f7",
    icon: Moon,
  },
  {
    id: "light",
    name: "Pearl",
    color: "#6366f1",
    icon: Sun,
  },
] as const;

export function LiquidThemeToggle() {
  const { theme, setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleThemeChange = async (event: React.MouseEvent) => {
    const nextTheme = theme === "dark" ? THEMES[1] : THEMES[0];

    // 1. Check for View Transition API support (Visionary Performance)
    if (
      !document.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTheme(nextTheme.id);
      return;
    }

    // 2. Calculate interaction coordinates for the "Spill" origin
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    // 3. Execute the "Liquid Spill" View Transition
    document.documentElement.classList.add("liquid-transition");
    const transition = document.startViewTransition(() => {
      setTheme(nextTheme.id);
    });

    transition.ready.then(() => {
      // Animate the clip-path from the click origin
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 700,
          easing: "cubic-bezier(0.25, 1, 0.5, 1)", // Fluid ease
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });

    transition.finished.then(() => {
      document.documentElement.classList.remove("liquid-transition");
      toast.success(`Switched to: ${nextTheme.name}`);
    });
  };

  const currentThemeConfig = THEMES.find((t) => t.id === theme) || THEMES[0];
  const CurrentIcon = currentThemeConfig.icon;

  return (
    <div className="relative z-50" ref={containerRef}>
      {/* The Trigger: A Floating Liquid Orb */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleThemeChange}
        className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center relative",
          "liquid-panel border-white/20 hover:border-white/40 interactive group overflow-hidden shadow-xl",
        )}
        title={`Switch to ${theme === "dark" ? "Pearl" : "Midnight"} theme`}
      >
        <CurrentIcon className="w-5 h-5 text-foreground/80 group-hover:text-primary transition-colors relative z-10" />
        {/* Glow effect matching current theme */}
        <motion.div
          layoutId="theme-glow"
          className="absolute inset-0 rounded-full opacity-30 blur-xl"
          style={{ backgroundColor: currentThemeConfig.color }}
        />
        {/* Animated spill wave in background */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 180, 270, 360],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute inset-0 opacity-10 bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none"
        />
      </motion.button>
    </div>
  );
}
