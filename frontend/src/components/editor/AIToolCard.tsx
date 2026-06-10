"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Scissors, Trash2, Play, SkipBack, SkipForward, Download,
  Captions, Plus, Minus, Bold, Film, RotateCcw, Sun, Moon,
  Volume2, VolumeX, Mic, MicOff, FastForward, Type, Star,
  ZoomIn, Eraser, Layers, Sparkles, Wand2, Palette, MessageSquareQuote,
  CornerDownRight, CornerDownLeft, MousePointer2, Building2, Camera,
  X, AudioLines,
} from "lucide-react";
import type { AiTool } from "@/lib/aiToolCatalog";

const ICON_MAP: Record<string, React.ElementType> = {
  Scissors, Trash2, Play, SkipBack, SkipForward, Download,
  Captions, Plus, Minus, Bold, Film, RotateCcw, Sun, Moon,
  Volume2, VolumeX, Mic, MicOff, FastForward, Type, Star,
  ZoomIn, Eraser, Layers, Sparkles, Wand2, Palette, MessageSquareQuote,
  CornerDownRight, CornerDownLeft, MousePointer2, Building2, Camera,
  X, AudioLines,
};

const CATEGORY_COLOR: Record<string, string> = {
  "AI Intelligence": "text-violet-400",
  Timeline: "text-sky-400",
  Captions: "text-emerald-400",
  Audio: "text-amber-400",
  Visual: "text-pink-400",
  Elements: "text-orange-400",
  Playback: "text-cyan-400",
};

interface AIToolCardProps {
  tool: AiTool;
  enabled: boolean;
  onActivate: (tool: AiTool) => void;
  variant?: "grid" | "palette";
  isSelected?: boolean;
}

export default function AIToolCard({
  tool,
  enabled,
  onActivate,
  variant = "grid",
  isSelected = false,
}: AIToolCardProps) {
  const Icon = ICON_MAP[tool.iconName] ?? Scissors;
  const iconColor = CATEGORY_COLOR[tool.category] ?? "text-fg-muted";
  const isGemini = tool.execMode === "gemini";

  if (variant === "palette") {
    return (
      <motion.button
        whileTap={{ scale: 0.98 }}
        disabled={!enabled}
        onClick={() => enabled && onActivate(tool)}
        className={[
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
          isSelected
            ? "bg-[#26262b] text-[#f4f4f5]"
            : "hover:bg-[#17171a] text-[#a1a1aa]",
          !enabled && "opacity-40 cursor-not-allowed",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={`${tool.name} — ${tool.category}${isGemini ? " · 1 credit" : " · free"}`}
      >
        <Icon size={14} className={`shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-medium">{tool.name}</p>
        </div>
        {isGemini && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/20 text-violet-400">
            AI
          </span>
        )}
        {tool.shortcut && (
          <kbd className="shrink-0 rounded bg-[#26262b] px-1 py-0.5 text-[10px] text-[#71717a]">
            {tool.shortcut}
          </kbd>
        )}
      </motion.button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      disabled={!enabled}
      onClick={() => enabled && onActivate(tool)}
      className={[
        "relative flex flex-col gap-1.5 rounded-xl border border-[#26262b] bg-[#17171a]",
        "p-3 text-left transition-colors hover:border-[#3d3d45] hover:bg-[#1e1e22]",
        !enabled && "opacity-40 cursor-not-allowed",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${tool.name} — ${tool.category}${isGemini ? " · 1 credit" : " · free"}`}
    >
      {isGemini && (
        <span className="absolute right-2 top-2 rounded px-1 py-0.5 text-[9px] font-semibold bg-violet-500/20 text-violet-400">
          AI
        </span>
      )}
      <Icon size={16} className={iconColor} />
      <p className="text-[11px] font-medium leading-tight text-[#f4f4f5] pr-5">
        {tool.name}
      </p>
      <p className="text-[10px] leading-snug text-[#71717a] line-clamp-2">
        {tool.description}
      </p>
    </motion.button>
  );
}
