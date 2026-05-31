import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Shortcut actions (single source of truth for the editor + settings) ──────

export type ShortcutId =
  | "playPause"
  | "split"
  | "addText"
  | "deleteClip"
  | "undo"
  | "redo"
  | "skipBack"
  | "skipForward"
  | "preflight"
  | "export";

export interface ShortcutAction {
  id: ShortcutId;
  label: string;
  description: string;
  default: string;
}

/** Ordered for display. `default` uses the canonical combo grammar below. */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: "playPause", label: "Play / Pause", description: "Toggle timeline playback", default: "Space" },
  { id: "split", label: "Split Clip", description: "Cut the active clip at the playhead", default: "S" },
  { id: "addText", label: "Add Text", description: "Drop a text overlay onto the canvas", default: "T" },
  { id: "deleteClip", label: "Delete Clip", description: "Remove the selected clip", default: "Delete" },
  { id: "undo", label: "Undo", description: "Step backward through edits", default: "Mod+Z" },
  { id: "redo", label: "Redo", description: "Step forward through edits", default: "Mod+Shift+Z" },
  { id: "skipBack", label: "Skip Back", description: "Nudge playhead back (hold Shift for 5s)", default: "ArrowLeft" },
  { id: "skipForward", label: "Skip Forward", description: "Nudge playhead forward (hold Shift for 5s)", default: "ArrowRight" },
  { id: "preflight", label: "Run Pre-Flight", description: "Simulate the audience on the active clip", default: "Shift+P" },
  { id: "export", label: "Export Short", description: "Render and download the active clip", default: "Mod+E" },
];

export type Bindings = Record<ShortcutId, string>;

const DEFAULT_BINDINGS: Bindings = SHORTCUT_ACTIONS.reduce((acc, a) => {
  acc[a.id] = a.default;
  return acc;
}, {} as Bindings);

// ─── Combo grammar helpers (pure) ─────────────────────────────────────────────
// Canonical combo string: parts joined by "+", ordered [Mod?, Shift?, Alt?, Key].
// "Mod" means Ctrl on Windows/Linux, ⌘ on macOS.

const MODIFIER_KEYS = new Set(["Shift", "Control", "Meta", "Alt", "CapsLock", "Tab"]);

/** Normalize a KeyboardEvent's primary key to a canonical token, or null if it's a bare modifier. */
function normalizeKey(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const key = e.key;
  if (key === " " || (e as KeyboardEvent).code === "Space") return "Space";
  if (MODIFIER_KEYS.has(key)) return null;
  if (key.length === 1) return key.toUpperCase();
  return key; // ArrowLeft, Delete, Enter, Escape, etc.
}

/** Build a canonical combo from a keyboard event, or null if only modifiers are held. */
export function eventToCombo(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const key = normalizeKey(e);
  if (!key) return null;
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("Mod");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  parts.push(key);
  return parts.join("+");
}

/** Does a keyboard event match a canonical combo? `looseShift` ignores the Shift modifier (used by skip). */
export function matchEvent(
  e: KeyboardEvent | React.KeyboardEvent,
  combo: string,
  opts?: { looseShift?: boolean }
): boolean {
  if (!combo) return false;
  const parts = combo.split("+");
  const wantMod = parts.includes("Mod");
  const wantShift = parts.includes("Shift");
  const wantAlt = parts.includes("Alt");
  const key = parts[parts.length - 1];

  const mod = e.metaKey || e.ctrlKey;
  if (mod !== wantMod) return false;
  if (!opts?.looseShift && e.shiftKey !== wantShift) return false;
  if (e.altKey !== wantAlt) return false;

  const ek =
    e.key === " " || (e as KeyboardEvent).code === "Space"
      ? "Space"
      : e.key.length === 1
      ? e.key.toUpperCase()
      : e.key;
  return ek === key;
}

const DISPLAY_KEY: Record<string, string> = {
  Mod: "⌘",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Space: "Space",
  Delete: "Del",
  Backspace: "⌫",
  Escape: "Esc",
  Enter: "↵",
};

/** Split a combo into display chips. `mac` swaps the Mod glyph for non-mac. */
export function comboToChips(combo: string, mac = true): string[] {
  return combo.split("+").map((p) => {
    if (p === "Mod") return mac ? "⌘" : "Ctrl";
    return DISPLAY_KEY[p] ?? p;
  });
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ShortcutsState {
  bindings: Bindings;
  setBinding: (id: ShortcutId, combo: string) => void;
  resetBinding: (id: ShortcutId) => void;
  resetAll: () => void;
  /** Returns the action id already using `combo` (excluding `exceptId`), or null. */
  findConflict: (combo: string, exceptId: ShortcutId) => ShortcutId | null;
}

export const useShortcutsStore = create<ShortcutsState>()(
  persist(
    (set, get) => ({
      bindings: { ...DEFAULT_BINDINGS },
      setBinding: (id: ShortcutId, combo: string) =>
        set((s) => ({ bindings: { ...s.bindings, [id]: combo } })),
      resetBinding: (id: ShortcutId) =>
        set((s) => ({ bindings: { ...s.bindings, [id]: DEFAULT_BINDINGS[id] } })),
      resetAll: () => set({ bindings: { ...DEFAULT_BINDINGS } }),
      findConflict: (combo: string, exceptId: ShortcutId) => {
        const { bindings } = get();
        const hit = (Object.keys(bindings) as ShortcutId[]).find(
          (k) => k !== exceptId && bindings[k] === combo
        );
        return hit ?? null;
      },
    }),
    {
      name: "qai-shortcuts",
      // Merge persisted bindings over defaults so newly-added actions always have a value.
      merge: (persisted, current) => {
        const p = persisted as { bindings?: Partial<Bindings> } | undefined;
        return {
          ...current,
          bindings: { ...DEFAULT_BINDINGS, ...(p?.bindings ?? {}) },
        };
      },
    }
  )
);

export const DEFAULTS = DEFAULT_BINDINGS;
