/**
 * Platform-safe UI toggle shortcuts — single source of truth.
 * Shift+Alt+X is not reserved by Chrome, Edge, or Firefox on any OS.
 * Mac alias Meta+Shift+X is not reserved by Mac Chrome either.
 */

export type UiShortcutId =
  | "toggleCommandPalette"
  | "toggleBRollDrawer"
  | "toggleFloatingChat";

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
};

/**
 * Returns true if a KeyboardEvent matches the given shortcut.
 * Matches:
 *   - Shift+Alt+key  (Win/Linux/Mac — universal)
 *   - Meta+Shift+key (Mac alias, no Alt)
 */
export function matchShortcut(e: KeyboardEvent, id: UiShortcutId): boolean {
  const s = SHORTCUTS[id];
  if (e.key.toLowerCase() !== s.key) return false;
  // Shift+Alt+Key — works on all platforms
  if (e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey) return true;
  // Meta+Shift+Key — Mac alias
  if (e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey) return true;
  return false;
}

/** Platform-aware shortcut label for tooltips. */
export function shortcutLabel(id: UiShortcutId): string {
  const s = SHORTCUTS[id];
  if (typeof navigator === "undefined") return s.label;
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return isMac ? s.macLabel : s.label;
}
