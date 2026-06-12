/**
 * Platform-safe UI toggle shortcuts — single source of truth.
 * Shift+Alt+X is not reserved by Chrome, Edge, or Firefox on any OS.
 * Mac alias Meta+Shift+X is not reserved by Mac Chrome either.
 */

export type UiShortcutId =
  | "toggleCommandPalette"
  | "toggleBRollDrawer"
  | "toggleFloatingChat"
  // ─── Phase 4b: timeline tool shortcuts (fire only when timeline focused) ──
  | "toolPointer"
  | "toolBlade"
  | "toolBladeAllTracks"
  | "toolRollingTrim"
  | "toolRippleDelete";

export interface UiShortcut {
  id: UiShortcutId;
  /** Lowercase key matching e.key */
  key: string;
  shift: boolean;
  alt: boolean;
  /** Win/Linux display label */
  label: string;
  /** Mac display label */
  macLabel: string;
}

/**
 * Combos Chrome on Windows/Linux intercepts before the page sees them.
 * Verified against Chrome 124 on Windows 11.
 */
const CHROME_RESERVED_WIN = new Set([
  "Ctrl+A", "Ctrl+B", "Ctrl+C", "Ctrl+D", "Ctrl+E", "Ctrl+F",
  "Ctrl+G", "Ctrl+H", "Ctrl+I", "Ctrl+J", "Ctrl+K", "Ctrl+L",
  "Ctrl+N", "Ctrl+O", "Ctrl+P", "Ctrl+R", "Ctrl+S", "Ctrl+T",
  "Ctrl+U", "Ctrl+V", "Ctrl+W", "Ctrl+X", "Ctrl+Y", "Ctrl+Z",
  "Ctrl+0", "Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4",
  "Ctrl+5", "Ctrl+6", "Ctrl+7", "Ctrl+8", "Ctrl+9",
  "Ctrl+Tab", "Ctrl+Shift+Tab", "Ctrl+Shift+N", "Ctrl+Shift+J",
  "Ctrl+Shift+I", "Ctrl+Shift+Delete", "Ctrl+Shift+B",
]);

/** True if Chrome/Edge on Windows/Linux intercepts this combo before the page. */
export function isChromeReserved(combo: string): boolean {
  const normalized = combo.replace(/\bMod\b/g, "Ctrl");
  return CHROME_RESERVED_WIN.has(normalized);
}

export const SHORTCUTS: Record<UiShortcutId, UiShortcut> = {
  toggleCommandPalette: {
    id: "toggleCommandPalette",
    key: "p",
    shift: true,
    alt: true,
    label: "Shift+Alt+P",
    macLabel: "⌘⇧P",
  },
  toggleBRollDrawer: {
    id: "toggleBRollDrawer",
    key: "b",
    shift: true,
    alt: true,
    label: "Shift+Alt+B",
    macLabel: "⌘⇧B",
  },
  toggleFloatingChat: {
    id: "toggleFloatingChat",
    key: "a",
    shift: true,
    alt: true,
    label: "Shift+Alt+A",
    macLabel: "⌘⇧A",
  },
  // ─── Phase 4b: timeline tool shortcuts ───────────────────────────────────
  toolPointer: {
    id: "toolPointer",
    key: "v",
    shift: false,
    alt: false,
    label: "V",
    macLabel: "V",
  },
  toolBlade: {
    id: "toolBlade",
    key: "s",
    shift: false,
    alt: false,
    label: "S",
    macLabel: "S",
  },
  toolBladeAllTracks: {
    id: "toolBladeAllTracks",
    key: "s",
    shift: true,
    alt: false,
    label: "Shift+S",
    macLabel: "⇧S",
  },
  toolRollingTrim: {
    id: "toolRollingTrim",
    key: "r",
    shift: true,
    alt: false,
    label: "Shift+R",
    macLabel: "⇧R",
  },
  toolRippleDelete: {
    id: "toolRippleDelete",
    key: "Delete",
    shift: true,
    alt: false,
    label: "Shift+Delete",
    macLabel: "⇧⌫",
  },
};

/**
 * Returns true if a KeyboardEvent matches the given shortcut.
 * UI panel shortcuts (Shift+Alt+X) also accept Meta+Shift+X as Mac alias.
 * Timeline tool shortcuts fire on the exact modifier combo defined in SHORTCUTS.
 */
export function matchShortcut(e: KeyboardEvent, id: UiShortcutId): boolean {
  const s = SHORTCUTS[id];
  const key = s.key === "Delete" ? e.key : e.key.toLowerCase();
  if (key !== s.key.toLowerCase() && e.key !== s.key) return false;
  // UI panel toggles use Shift+Alt or Mac Meta+Shift alias
  if (s.shift && s.alt) {
    if (e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey) return true;
    if (e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey) return true;
    return false;
  }
  // Timeline tool shortcuts: exact modifier match
  return (
    e.shiftKey === s.shift &&
    e.altKey === s.alt &&
    !e.ctrlKey &&
    !e.metaKey
  );
}

/** Platform-aware shortcut label for tooltips. */
export function shortcutLabel(id: UiShortcutId): string {
  const s = SHORTCUTS[id];
  if (typeof navigator === "undefined") return s.label;
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return isMac ? s.macLabel : s.label;
}
