"use client";

import { useEditorStore, CanvasElement } from "@/stores/editorStore";
import { useEffect } from "react";
import { motion, useMotionValue } from "framer-motion";
import { X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { RenderOverlay } from "@/lib/render/renderManifest";

// Phase 54: manifest overlays render as lightweight preview placeholders; legacy elements remain fallback.

interface CanvasLayerProps {
  manifestActiveOverlayIds?: string[];
  manifestActiveOverlays?: RenderOverlay[];
}

export function CanvasLayer({
  manifestActiveOverlayIds,
  manifestActiveOverlays,
}: CanvasLayerProps = {}) {
  const { canvasElements, updateCanvasElement, removeCanvasElement } = useEditorStore();

  const hasManifestOverlays =
    Array.isArray(manifestActiveOverlays) && manifestActiveOverlays.length > 0;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {hasManifestOverlays ? (
        // Phase 54: Manifest-driven lightweight overlay placeholders
        manifestActiveOverlays!.map((overlay) => {
          const x = typeof overlay.x === "number" ? overlay.x : 50;
          const y = typeof overlay.y === "number" ? overlay.y : 50;
          const scale = typeof overlay.scale === "number" ? overlay.scale : 1;
          const rotation = typeof overlay.rotation === "number" ? overlay.rotation : 0;
          const opacity = typeof overlay.opacity === "number" ? Math.min(1, Math.max(0, overlay.opacity)) : 0.85;
          const label = overlay.type ?? "overlay";

          return (
            <div
              key={overlay.id}
              className="absolute pointer-events-none select-none"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
                opacity,
              }}
            >
              <div
                className={cn(
                  "px-3 py-1.5 rounded-lg border border-white/20",
                  "bg-black/40 backdrop-blur-sm",
                  "text-[10px] font-black uppercase tracking-widest text-white/80"
                )}
              >
                {label}
              </div>
            </div>
          );
        })
      ) : (
        // Legacy store-driven canvas elements (fallback)
        canvasElements.map((el) => (
          <DraggableElement
            key={el.id}
            element={el}
            onUpdate={(updates) => updateCanvasElement(el.id, updates)}
            onRemove={() => removeCanvasElement(el.id)}
          />
        ))
      )}
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
  const x = useMotionValue(element.x);
  const y = useMotionValue(element.y);

  // Sync store coordinates into motion values when the store updates
  // (e.g. after a reset or programmatic move). During an active drag,
  // Framer Motion owns the values so these writes are no-ops in practice.
  useEffect(() => { x.set(element.x); }, [element.x, x]);
  useEffect(() => { y.set(element.y); }, [element.y, y]);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startScale = element.scale;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const newScale = Math.max(0.2, Math.min(5, startScale + dx / 200));
      onUpdate({ scale: newScale });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      style={{ x, y, rotate: element.rotation }}
      animate={{ scale: element.scale, opacity: 1 }}
      initial={{ scale: 0.8, opacity: 0 }}
      onDragEnd={() => {
        onUpdate({ x: x.get(), y: y.get() });
      }}
      className="absolute pointer-events-auto group cursor-move touch-none"
    >
      {/* Controls — always visible for text, hover-only for other elements */}
      <div
        className={cn(
          "absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity bg-background/80 backdrop-blur-md border border-border rounded-full px-2 py-1 shadow-2xl z-50",
          element.type === "text" ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <button
          aria-label="Rotate element 15 degrees"
          onClick={(e) => { e.stopPropagation(); onUpdate({ rotation: element.rotation + 15 }); }}
          className="p-1.5 hover:bg-foreground/10 rounded-full text-muted-foreground hover:text-primary transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <div className="w-px h-3 bg-foreground/10 mx-1" />
        <button
          aria-label="Remove element"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 hover:bg-red-500/20 rounded-full text-muted-foreground hover:text-red-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Content — text overlays show a persistent bounding box; others show on hover */}
      <div
        className={cn(
          "relative select-none",
          element.type === "text" ? "px-4 py-2" : "p-2",
          element.type === "text"
            ? "ring-1 ring-primary/40 ring-offset-2 ring-offset-transparent rounded-lg group-hover:ring-primary/70"
            : "group-hover:ring-2 ring-primary/50 ring-offset-4 ring-offset-transparent rounded-lg",
          "transition-all",
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

      {/* Resize Handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute -bottom-2 -right-2 w-4 h-4 bg-primary rounded-full border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity cursor-se-resize shadow-lg z-50"
      />
    </motion.div>
  );
}
