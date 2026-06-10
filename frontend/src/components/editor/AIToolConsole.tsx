"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  AI_TOOL_CATALOG,
  searchTools,
  type AiTool,
  type ToolExecutionContext,
  type ToolCategory,
} from "@/lib/aiToolCatalog";
import AIToolCard from "@/components/editor/AIToolCard";
import { useEditorStore } from "@/stores/editorStore";
import { useAiCommander } from "@/hooks/useAiCommander";

const CATEGORY_ORDER: ToolCategory[] = [
  "AI Intelligence",
  "Timeline",
  "Playback",
  "Captions",
  "Visual",
  "Audio",
  "Elements",
];

function buildContext(s: ReturnType<typeof useEditorStore.getState>): ToolExecutionContext {
  const captions = (s as any).captions ?? [];
  const elements = (s as any).elements ?? [];
  const selectedElementId = (s as any).selectedElementId ?? null;
  const el = elements.find((e: { id: string }) => e.id === selectedElementId);
  return {
    currentTime: s.currentTime ?? 0,
    duration: s.duration ?? 0,
    selectedClipId: (s as any).selectedClipId ?? null,
    selectedElementId,
    captionCount: captions.length,
    elementCount: elements.length,
    captionsEnabled: (s as any).captionsEnabled ?? true,
    audioBoost: (s as any).exportSettings?.audioBoost ?? 100,
    playbackSpeed: (s as any).exportSettings?.playbackSpeed ?? 100,
    visualFilter:
      ((s as any).exportSettings?.filter as ToolExecutionContext["visualFilter"]) ?? "None",
    isPlaying: (s as any).isPlaying ?? false,
    lastCaptionId: captions.length ? captions[captions.length - 1].id : null,
    selectedElementScale: (el as any)?.scale ?? 1,
  };
}

export default function AIToolConsole() {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const commander = useAiCommander();

  const ctx = useEditorStore((s) => buildContext(s as any));

  const results = query.trim()
    ? searchTools(query, ctx)
    : null;

  const visibleResults = results ?? [];

  const activate = useCallback(
    (tool: AiTool) => {
      const enabled = !tool.isEnabled || tool.isEnabled(ctx);
      if (!enabled) {
        toast.warning(`"${tool.name}" is unavailable in the current clip state.`);
        return;
      }

      if (tool.execMode === "direct") {
        const actions = tool.buildActions ? tool.buildActions(ctx) : [];
        if (!actions.length) {
          toast.info(`${tool.name}: nothing to do.`);
          return;
        }
        useEditorStore.getState().dispatchAIActions(actions as any);
        toast.success(`${tool.name} applied.`);
        return;
      }

      if (tool.execMode === "gemini") {
        if (!tool.geminiPrompt) return;
        commander.execute(tool.geminiPrompt);
        toast.info(`Asking Gemini: ${tool.name}…`);
        setQuery("");
      }
    },
    [ctx, commander],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!visibleResults.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, visibleResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const tool = visibleResults[selectedIdx];
        if (tool) activate(tool);
      } else if (e.key === "Escape") {
        setQuery("");
      }
    },
    [visibleResults, selectedIdx, activate],
  );

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const groupedTools = CATEGORY_ORDER.reduce<Record<ToolCategory, AiTool[]>>(
    (acc, cat) => {
      acc[cat] = AI_TOOL_CATALOG.filter((t) => t.category === cat);
      return acc;
    },
    {} as Record<ToolCategory, AiTool[]>,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search bar */}
      <div className="relative px-3 pb-2 pt-1">
        <Search
          size={13}
          className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-[#71717a]"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search tools… (Cmd+K)"
          className="w-full rounded-lg border border-[#26262b] bg-[#111113] py-1.5 pl-8 pr-8 text-xs text-[#f4f4f5] placeholder-[#71717a] outline-none focus:border-[#a855f7] transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-[#f4f4f5]"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <AnimatePresence mode="wait">
          {query.trim() ? (
            /* Palette / search results */
            <motion.div
              key="palette"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {visibleResults.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#71717a]">No tools match.</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {visibleResults.map((tool, i) => (
                    <AIToolCard
                      key={tool.id}
                      tool={tool}
                      enabled={!tool.isEnabled || tool.isEnabled(ctx)}
                      onActivate={activate}
                      variant="palette"
                      isSelected={i === selectedIdx}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            /* Grid mode — category sections */
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="flex flex-col gap-5"
            >
              {CATEGORY_ORDER.map((cat) => {
                const tools = groupedTools[cat];
                if (!tools?.length) return null;
                return (
                  <div key={cat}>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#52525b]">
                      {cat}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {tools.map((tool) => (
                        <AIToolCard
                          key={tool.id}
                          tool={tool}
                          enabled={!tool.isEnabled || tool.isEnabled(ctx)}
                          onActivate={activate}
                          variant="grid"
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer hint */}
      <div className="border-t border-[#26262b] px-3 py-1.5 text-[10px] text-[#52525b]">
        ↑↓ navigate &nbsp;·&nbsp; Enter run &nbsp;·&nbsp; Esc clear
      </div>
    </div>
  );
}
