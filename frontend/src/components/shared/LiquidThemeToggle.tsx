"use client";

import React, { useRef, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Droplets, Zap, Flame, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Theme definitions matching our CSS variables
const THEMES = [
  {
    id: "dark",
    name: "Deep Ocean",
    color: "#4f46e5", // Indigo
    icon: Droplets,
    description: "Bio-luminescent Depth",
  },
  {
    id: "crystal",
    name: "Pure Crystal",
    color: "#3b82f6", // Sky Blue
    icon: Snowflake, // Using Snowflake as proxy for Crystal
    description: "Optical Clarity",
  },
  {
    id: "neon",
    name: "Neon Flow",
    color: "#d946ef", // Fuchsia
    icon: Zap,
    description: "Cyberpunk High-Vis",
  },
  {
    id: "magma",
    name: "Obsidian Magma",
    color: "#f97316", // Orange
    icon: Flame,
    description: "Volcanic Intensity",
  },
];

export function LiquidThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleThemeChange = async (
    newTheme: string,
    event: React.MouseEvent,
  ) => {
    // 1. Check for View Transition API support (Visionary Performance)
    if (
      !document.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTheme(newTheme);
      setIsOpen(false);
      return;
    }

    // 2. Calculate interaction coordinates for the "Spill" origin
    const target = event.target as HTMLElement;
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
      setTheme(newTheme);
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
          duration: 600,
          easing: "cubic-bezier(0.25, 1, 0.5, 1)", // Fluid ease
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });

    transition.finished.then(() => {
      document.documentElement.classList.remove("liquid-transition");
      setIsOpen(false);
      toast.success(`Theme spilled: ${newTheme}`);
    });
  };

  const currentThemeConfig = THEMES.find((t) => t.id === theme) || THEMES[0];
  const CurrentIcon = currentThemeConfig.icon;

  return (
    <div className="relative z-50" ref={containerRef}>
      {/* The Trigger: A Floating Liquid Orb */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center relative",
          "liquid-panel border-white/20 hover:border-white/40 interactive",
          isOpen && "ring-2 ring-primary/50",
        )}
      >
        <CurrentIcon className="w-5 h-5 text-foreground/80" />
        {/* Glow effect matching current theme */}
        <div
          className="absolute inset-0 rounded-full opacity-20 blur-md"
          style={{ backgroundColor: currentThemeConfig.color }}
        />
      </motion.button>

      {/* The Spill Menu: Holographic Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="absolute bottom-full right-0 mb-4 w-64 p-2 rounded-2xl liquid-panel backdrop-blur-3xl overflow-hidden"
          >
            <div className="space-y-1">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={(e) => handleThemeChange(t.id, e)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group",
                    theme === t.id
                      ? "bg-white/10 shadow-[inner_0_0_10px_rgba(255,255,255,0.05)] border border-white/10"
                      : "hover:bg-white/5 hover:translate-x-1",
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110",
                    )}
                    style={{
                      backgroundColor: t.color,
                      boxShadow: `0 0 15px ${t.color}40`,
                    }}
                  >
                    <t.icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-semibold tracking-wide">
                      {t.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider opacity-70">
                      {t.description}
                    </span>
                  </div>
                  {theme === t.id && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
