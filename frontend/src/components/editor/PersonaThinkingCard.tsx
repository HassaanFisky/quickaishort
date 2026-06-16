"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface PersonaThinkingData {
  id: string;
  emoji: string;
  title: string;
  color: string; // tailwind gradient, e.g. "from-pink-500 to-rose-500"
  borderColor: string; // tailwind border, e.g. "border-pink-500/30"
}

// Mirrors the 6 real backend personas (PERSONA_WEIGHTS / PERSONA_IDENTITIES
// in fastapi/agent/preflight_agent.py) and the PERSONA_LABELS map below in
// this same file — not invented marketing personas.
export const PREFLIGHT_PERSONAS: PersonaThinkingData[] = [
  { id: "genz", emoji: "⚡", title: "Gen Z", color: "from-pink-500 to-rose-500", borderColor: "border-pink-500/30" },
  { id: "millennial", emoji: "💼", title: "Millennial", color: "from-orange-500 to-yellow-500", borderColor: "border-orange-500/30" },
  { id: "sports", emoji: "🏆", title: "Sports Fan", color: "from-emerald-500 to-teal-500", borderColor: "border-emerald-500/30" },
  { id: "tech", emoji: "🖥️", title: "Tech Nerd", color: "from-blue-500 to-cyan-500", borderColor: "border-blue-500/30" },
  { id: "entertainment", emoji: "🎬", title: "Entertainment", color: "from-purple-500 to-fuchsia-500", borderColor: "border-purple-500/30" },
  { id: "news", emoji: "📰", title: "News Reader", color: "from-slate-500 to-gray-500", borderColor: "border-slate-500/30" },
];

interface Props {
  persona: PersonaThinkingData;
  delay?: number;
}

/**
 * Visible "thinking" state for one of the 6 Pre-Flight audience personas,
 * shown while the backend's ParallelAgent panel is running. The actual
 * verdict reveal (retention %, hook strength, reasoning) already exists in
 * PersonaCard inside RightPanel.tsx once the result arrives — this component
 * only covers the analyzing/loading state that used to be a generic
 * TimelineLoader with no persona identity.
 */
export function PersonaThinkingCard({ persona, delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 32, delay }}
      className={cn("relative rounded-xl border bg-muted p-3 flex flex-col gap-2", persona.borderColor)}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center text-sm bg-gradient-to-br shrink-0",
            persona.color,
          )}
        >
          {persona.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-foreground truncate">
            {persona.title}
          </p>
          <p className="text-[9px] text-muted-foreground">analyzing…</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1 h-1 rounded-full bg-primary"
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          ))}
        </div>
      </div>
      <div className="relative h-1 rounded-full bg-foreground/10 overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-pink-500"
          initial={{ width: "0%" }}
          animate={{ width: ["0%", "70%", "85%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}
