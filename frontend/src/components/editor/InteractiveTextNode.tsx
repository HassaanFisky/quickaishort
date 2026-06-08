"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import { X, RotateCcw } from "lucide-react";
import { TextElement } from "@/stores/editorStore";
import { cn } from "@/lib/utils";

interface Props {
  element: TextElement;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<TextElement>) => void;
  onRemove: () => void;
}

export function InteractiveTextNode({ element, isSelected, onSelect, onUpdate, onRemove }: Props) {
  const x = useMotionValue(element.x);
  const y = useMotionValue(element.y);
  const [editing, setEditing] = useState(false);
  const contentRef = useRef<HTMLSpanElement>(null);

  // Sync store position into motion values (programmatic moves)
  useEffect(() => { x.set(element.x); }, [element.x, x]);
  useEffect(() => { y.set(element.y); }, [element.y, y]);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startScale = element.scale;
    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      onUpdate({ scale: Math.max(0.2, Math.min(5, startScale + dx / 200)) });
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(contentRef.current);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }, 0);
  };

  const handleBlur = () => {
    setEditing(false);
    if (contentRef.current) {
      onUpdate({ text: contentRef.current.textContent || "" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      contentRef.current?.blur();
    }
    if (e.key === "Escape") {
      contentRef.current?.blur();
    }
  };

  return (
    <motion.div
      drag={!editing}
      dragMomentum={false}
      style={{ x, y, rotate: element.rotation }}
      animate={{ scale: element.scale, opacity: 1 }}
      initial={{ scale: 0.8, opacity: 0 }}
      onDragStart={() => onSelect()}
      onDragEnd={() => onUpdate({ x: x.get(), y: y.get() })}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onDoubleClick={handleDoubleClick}
      className="absolute pointer-events-auto cursor-move touch-none group"
    >
      {/* Controls bar */}
      {isSelected && !editing && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/90 backdrop-blur-md border border-border rounded-full px-2 py-1 shadow-xl z-50 whitespace-nowrap">
          <button
            aria-label="Rotate 15 degrees"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onUpdate({ rotation: element.rotation + 15 }); }}
            className="p-1.5 hover:bg-foreground/10 rounded-full text-muted-foreground hover:text-primary transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <div className="w-px h-3 bg-foreground/10 mx-0.5" />
          <button
            aria-label="Remove element"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1.5 hover:bg-red-500/20 rounded-full text-muted-foreground hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Text content */}
      <div
        className={cn(
          "relative select-none px-4 py-2 rounded-lg transition-all",
          isSelected
            ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-transparent"
            : "ring-1 ring-primary/30 group-hover:ring-primary/50",
        )}
      >
        <span
          ref={contentRef}
          contentEditable={editing}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] whitespace-pre-wrap outline-none"
          style={{
            color: element.color,
            fontSize: element.fontSize ? `${element.fontSize}px` : undefined,
            fontWeight: element.fontWeight,
          }}
        >
          {element.text}
        </span>
        {editing && (
          <span className="absolute -bottom-5 left-0 text-[9px] text-primary/70 font-medium whitespace-nowrap">
            Enter to confirm · Esc to cancel
          </span>
        )}
      </div>

      {/* Resize handle */}
      {isSelected && !editing && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute -bottom-2 -right-2 w-4 h-4 bg-primary rounded-full border-2 border-background shadow-lg cursor-se-resize z-50"
        />
      )}
    </motion.div>
  );
}
