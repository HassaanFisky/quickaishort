"use client";

import { useEditorStore, CanvasElement } from "@/stores/editorStore";
import { motion } from "framer-motion";
import { X, GripHorizontal, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export function CanvasLayer() {
  const { canvasElements, updateCanvasElement, removeCanvasElement } = useEditorStore();

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {canvasElements.map((el) => (
        <DraggableElement
          key={el.id}
          element={el}
          onUpdate={(updates) => updateCanvasElement(el.id, updates)}
          onRemove={() => removeCanvasElement(el.id)}
        />
      ))}
    </div>
  );
}

function DraggableElement({
  element,
  onUpdate,
  onRemove,
}: {
  element: CanvasElement;
  onUpdate: (updates: Partial<CanvasElement>) => void;
  onRemove: () => void;
}) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ x: element.x, y: element.y, scale: 0.8, opacity: 0 }}
      animate={{ x: element.x, y: element.y, scale: element.scale, opacity: 1 }}
      onDragEnd={(_, info) => {
        onUpdate({ x: element.x + info.offset.x, y: element.y + info.offset.y });
      }}
      style={{ rotate: element.rotation }}
      className="absolute pointer-events-auto group cursor-move touch-none"
    >
      {/* Controls */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-md border border-white/10 rounded-full px-2 py-1 shadow-2xl z-50">
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ rotation: element.rotation + 15 }); }}
          className="p-1.5 hover:bg-white/10 rounded-full text-muted-foreground hover:text-primary transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3 bg-white/10 mx-1" />
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 hover:bg-red-500/20 rounded-full text-muted-foreground hover:text-red-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div 
        className={cn(
          "relative select-none",
          element.type === "text" ? "px-4 py-2" : "p-2",
          "group-hover:ring-2 ring-primary/50 ring-offset-4 ring-offset-transparent rounded-lg transition-all"
        )}
      >
        {element.type === "text" ? (
          <span 
            className={cn("text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]", element.style?.className)}
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onUpdate({ content: e.currentTarget.textContent || "" })}
          >
            {element.content}
          </span>
        ) : (
          <span className="text-6xl drop-shadow-2xl">{element.content}</span>
        )}
      </div>

      {/* Resize Handle (Simplified) */}
      <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-primary rounded-full border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity cursor-se-resize shadow-lg" />
    </motion.div>
  );
}
