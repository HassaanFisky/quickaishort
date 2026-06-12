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
} from "lucide-react";

interface ToolDef {
  id: ToolId;
  icon: React.ElementType;
  label: string;
  shortcut?: string;
}

const TOOLS: ToolDef[] = [
  { id: "pointer",         icon: MousePointer2,  label: "Pointer",          shortcut: "V" },
  { id: "blade",           icon: Scissors,        label: "Blade",            shortcut: "S" },
  { id: "ripple",          icon: MoveHorizontal,  label: "Ripple Trim",      shortcut: undefined },
  { id: "rolling",         icon: Repeat2,         label: "Rolling Trim",     shortcut: "⇧R" },
  { id: "slip",            icon: Move,            label: "Slip",             shortcut: undefined },
  { id: "slide",           icon: MoveHorizontal,  label: "Slide",            shortcut: undefined },
  { id: "ripple-delete",   icon: Trash2,          label: "Ripple Delete",    shortcut: "⇧⌫" },
  { id: "duration-stretch",icon: Maximize2,       label: "Duration Stretch", shortcut: undefined },
];

export function TimelineToolbar() {
  const activeTimelineTool = useEditorStore((s) => s.activeTimelineTool);
  const setActiveTimelineTool = useEditorStore((s) => s.setActiveTimelineTool);

  return (
    <div
      aria-label="Timeline tools"
      className="flex flex-col gap-1 p-1 bg-card border border-border rounded-xl shadow-md"
    >
      {TOOLS.map(({ id, icon: Icon, label, shortcut }) => (
        <button
          key={id}
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
      ))}
    </div>
  );
}
