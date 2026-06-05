"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Keyboard } from "lucide-react";
import { SHORTCUT_ACTIONS, comboToChips, useShortcutsStore } from "@/stores/shortcutsStore";

const FIXED_SHORTCUTS = [
  { label: "Cut at Playhead", chips: ["C"] },
  { label: "Rewind 10s", chips: ["J"] },
  { label: "Play / Pause", chips: ["K"] },
  { label: "Forward 10s", chips: ["L"] },
  { label: "Show Shortcuts", chips: ["?"] },
  { label: "Open AI Editor", chips: ["Ctrl", "K"] },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutOverlay({ isOpen, onClose }: Props) {
  const bindings = useShortcutsStore((s) => s.bindings);
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="shortcut-overlay-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Keyboard className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground">
                  Keyboard Shortcuts
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close shortcuts"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Shortcuts grid */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-0.5 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              {SHORTCUT_ACTIONS.map((action) => {
                const combo = bindings[action.id] ?? action.default;
                return (
                  <ShortcutRow
                    key={action.id}
                    label={action.label}
                    chips={comboToChips(combo, isMac)}
                  />
                );
              })}
              {FIXED_SHORTCUTS.map((s) => (
                <ShortcutRow key={s.label} label={s.label} chips={s.chips} />
              ))}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-3 border-t border-border bg-muted/20 text-center">
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">
                Press{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono text-[9px]">
                  ?
                </kbd>{" "}
                or{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono text-[9px]">
                  Esc
                </kbd>{" "}
                to close
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShortcutRow({ label, chips }: { label: string; chips: string[] }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-foreground/5 transition-colors">
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      <div className="flex items-center gap-1">
        {chips.map((chip, i) => (
          <kbd
            key={i}
            className="px-1.5 py-0.5 rounded bg-foreground/10 border border-foreground/10 font-mono text-[10px] text-foreground/70 font-bold"
          >
            {chip}
          </kbd>
        ))}
      </div>
    </div>
  );
}
