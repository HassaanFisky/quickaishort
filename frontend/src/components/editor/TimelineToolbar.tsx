"use client";

import { useEditorStore, type ToolId } from "@/stores/editorStore";
import { cn } from "@/lib/utils";
import {
  MousePointer2,
  Scissors,
  MoveHorizontal,
  Repeat2,
  Move,
  Trash2,
  Maximize2,
  ChevronRight,
  ChevronLeft,
  LogIn,
  LogOut,
  Brackets,
  ChevronsLeftRight,
  ArrowUpFromLine,
  Plus,
  PenLine,
  ArrowLeftRight,
  Hand,
  ZoomIn,
  Magnet,
} from "lucide-react";

interface ToolDef {
  id: ToolId;
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  dividerBefore?: boolean;
}

const TOOLS: ToolDef[] = [
  // ── Selection ────────────────────────────────────────────────────────────
  { id: "pointer",         icon: MousePointer2,    label: "Pointer",          shortcut: "V" },
  { id: "forward-lane",    icon: ChevronRight,     label: "Forward lane",     shortcut: "A" },
  { id: "backward-lane",   icon: ChevronLeft,      label: "Backward lane",    shortcut: "⇧A" },
  // ── Edit ─────────────────────────────────────────────────────────────────
  { id: "blade",           icon: Scissors,         label: "Blade",            shortcut: "S",   dividerBefore: true },
  { id: "ripple",          icon: MoveHorizontal,   label: "Ripple Trim" },
  { id: "rolling",         icon: Repeat2,          label: "Rolling Trim",     shortcut: "⇧R" },
  { id: "slip",            icon: Move,             label: "Slip" },
  { id: "slide",           icon: MoveHorizontal,   label: "Slide" },
  { id: "ripple-delete",   icon: Trash2,           label: "Ripple Delete",    shortcut: "⇧⌫" },
  { id: "extract",         icon: Scissors,         label: "Extract",          shortcut: ";" },
  { id: "lift",            icon: ArrowUpFromLine,  label: "Lift",             shortcut: "'" },
  { id: "insert-edit",     icon: Plus,             label: "Insert edit",      shortcut: "," },
  { id: "overwrite-edit",  icon: PenLine,          label: "Overwrite edit",   shortcut: "." },
  { id: "swap-clip",       icon: ArrowLeftRight,   label: "Swap clip",        shortcut: "Y" },
  { id: "duration-stretch",icon: Maximize2,        label: "Duration stretch" },
  // ── Mark ─────────────────────────────────────────────────────────────────
  { id: "mark-in",         icon: LogIn,            label: "Mark In",          shortcut: "I",   dividerBefore: true },
  { id: "mark-out",        icon: LogOut,           label: "Mark Out",         shortcut: "O" },
  { id: "clip-range-mark", icon: Brackets,         label: "Mark clip range",  shortcut: "X" },
  { id: "range-mark",      icon: ChevronsLeftRight,label: "Range mark",       shortcut: "⇧X" },
  // ── Navigate ─────────────────────────────────────────────────────────────
  { id: "scroll-hand",     icon: Hand,             label: "Hand",             shortcut: "H",   dividerBefore: true },
  { id: "timeline-zoom",   icon: ZoomIn,           label: "Zoom",             shortcut: "Z" },
  { id: "magnetic-snap",   icon: Magnet,           label: "Magnetic snap",    shortcut: "M" },
];

export function TimelineToolbar() {
  const activeTimelineTool = useEditorStore((s) => s.activeTimelineTool);
  const setActiveTimelineTool = useEditorStore((s) => s.setActiveTimelineTool);

  return (
    <div
      aria-label="Timeline tools"
      className="flex flex-col gap-0.5 p-1 bg-card border border-border rounded-xl shadow-md"
    >
      {TOOLS.map(({ id, icon: Icon, label, shortcut, dividerBefore }) => (
        <div key={id}>
          {dividerBefore && (
            <div className="my-1 mx-1 h-px bg-border/50" />
          )}
          <button
            onClick={() => setActiveTimelineTool(id)}
            aria-label={shortcut ? `${label} (${shortcut})` : label}
            title={shortcut ? `${label}  ${shortcut}` : label}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              activeTimelineTool === id
                ? "bg-primary/20 border border-primary/40 text-primary"
                : "text-fg-muted hover:text-foreground hover:bg-foreground/5",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
