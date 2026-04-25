"use client";

import React from "react";
import {
  MousePointer2,
  Scissors,
  Type,
  Undo2,
  Redo2,
  Save,
  Download,
  Trash2,
  Sparkles,
} from "lucide-react";
import { useTimelineStore } from "@/lib/editor/timeline-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Toolbar() {
  const {
    undo,
    redo,
    save,
    isDirty,
    selectedClipId,
    deleteClip,
    splitClip,
    currentTime,
    historyIndex,
    history,
  } = useTimelineStore();

  const [activeTool, setActiveTool] = React.useState<
    "select" | "razor" | "text"
  >("select");

  const handleSplit = () => {
    if (selectedClipId) {
      splitClip(selectedClipId, currentTime);
    }
  };

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-xl z-50">
      <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-neutral-800 rounded-xl shadow-inner">
        <ToolbarButton
          icon={<MousePointer2 size={18} />}
          label="Select (V)"
          active={activeTool === "select"}
          onClick={() => setActiveTool("select")}
        />
        <ToolbarButton
          icon={<Scissors size={18} />}
          label="Split (S)"
          active={activeTool === "razor"}
          onClick={() => {
            setActiveTool("razor");
            handleSplit();
          }}
        />
        <ToolbarButton
          icon={<Type size={18} />}
          label="Text (T)"
          active={activeTool === "text"}
          onClick={() => setActiveTool("text")}
        />
        <div className="w-px h-6 bg-neutral-800 mx-1" />
        <ToolbarButton
          icon={<Trash2 size={18} />}
          label="Delete"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && deleteClip(selectedClipId)}
          className="hover:text-red-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="w-10 h-10 hover:bg-neutral-800 text-neutral-400 disabled:opacity-20"
            onClick={undo}
            disabled={historyIndex <= 0}
          >
            <Undo2 size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-10 h-10 hover:bg-neutral-800 text-neutral-400 disabled:opacity-20"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
          >
            <Redo2 size={18} />
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 border-neutral-800 bg-neutral-900 transition-all",
            isDirty &&
              "border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
          )}
          onClick={() => void save()}
        >
          <Save size={16} />
          {isDirty ? "Save" : "Saved"}
        </Button>

        <Button
          size="sm"
          className="gap-2 bg-gradient-to-tr from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 border-none shadow-lg shadow-pink-900/20 px-6"
          disabled
        >
          <Sparkles size={16} className="text-white/80" />
          AI (Pro)
        </Button>

        <Button
          size="sm"
          className="gap-2 bg-blue-600 hover:bg-blue-500 text-white border-none shadow-lg shadow-blue-900/20 px-6"
        >
          <Download size={16} />
          Export
        </Button>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={cn(
        "w-10 h-10 rounded-lg transition-all",
        active
          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500"
          : "text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800",
        className,
      )}
    >
      {icon}
    </Button>
  );
}
