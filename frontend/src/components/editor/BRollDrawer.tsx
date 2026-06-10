"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useEditorStore } from "@/stores/editorStore";
import { searchBRoll, BRollSearchError } from "@/lib/brollClient";
import type { BRollClip, OverlayPosition } from "@/types/ai-editor";

export function BRollDrawer() {
  const isOpen = useEditorStore((s) => s.isBRollDrawerOpen);
  const setOpen = useEditorStore((s) => s.setBRollDrawerOpen);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const dispatchAIActions = useEditorStore((s) => s.dispatchAIActions);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BRollClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<OverlayPosition>("pip_br");

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await searchBRoll(q, 12);
      setResults(data);
    } catch (err) {
      toast.error(err instanceof BRollSearchError ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void runSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, setOpen]);

  const applyClip = useCallback(
    (clip: BRollClip) => {
      if (duration === 0) {
        toast.error("Load a video first");
        return;
      }
      const start = Math.min(currentTime, duration - 1);
      const dur = Math.min(clip.duration_sec, duration - start, 10);
      if (dur < 0.5) {
        toast.error("Not enough room — move playhead earlier");
        return;
      }
      dispatchAIActions([
        {
          type: "ADD_BROLL",
          payload: {
            pexels_id: clip.pexels_id,
            download_url: clip.download_url,
            thumbnail_url: clip.thumbnail_url,
            title: clip.title,
            start_sec: start,
            duration_sec: dur,
            position,
            opacity: 1.0,
          },
        },
      ]);
      toast.success(`Added: ${clip.title || "B-roll"} at ${start.toFixed(1)}s`);
    },
    [currentTime, duration, position, dispatchAIActions],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="broll-drawer"
          initial={{ y: 240 }}
          animate={{ y: 0 }}
          exit={{ y: 240 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-0 left-0 right-0 h-[240px] bg-card border-t border-border shadow-2xl z-50 flex flex-col"
          role="dialog"
          aria-label="B-Roll library"
        >
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                B-Roll Library
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close B-roll library"
              className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </header>

          {/* Search + position row */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Pexels (e.g. 'forest', 'cityscape', 'coffee')"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:border-primary/40 placeholder:text-muted-foreground transition-colors"
              />
            </div>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as OverlayPosition)}
              className="text-xs bg-muted border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary/40 transition-colors"
              aria-label="Position preset"
            >
              <option value="full">Full frame</option>
              <option value="pip_tl">PIP top-left</option>
              <option value="pip_tr">PIP top-right</option>
              <option value="pip_bl">PIP bottom-left</option>
              <option value="pip_br">PIP bottom-right</option>
              <option value="split_left">Split left</option>
              <option value="split_right">Split right</option>
            </select>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-3">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                {query.length < 2
                  ? "Type 2+ letters to search Pexels"
                  : `No B-roll for "${query}"`}
              </div>
            ) : (
              <div className="flex gap-3 h-full">
                {results.map((clip) => (
                  <button
                    key={clip.pexels_id}
                    onClick={() => applyClip(clip)}
                    className="shrink-0 w-[160px] h-full rounded-lg overflow-hidden border border-border hover:border-primary/60 focus:outline-none focus:border-primary transition-colors group"
                    aria-label={`Add ${clip.title || "B-roll clip"} (${clip.duration_sec.toFixed(0)}s) to V3 lane`}
                  >
                    <div className="relative w-full h-[130px] bg-muted overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={clip.thumbnail_url}
                        alt={clip.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white font-mono">
                        {clip.duration_sec.toFixed(0)}s
                      </div>
                    </div>
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground truncate text-left">
                      {clip.title || "Pexels clip"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-1.5 border-t border-border text-[10px] text-muted-foreground shrink-0">
            Esc to close · Click a clip to add at playhead · All clips royalty-free from Pexels
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
