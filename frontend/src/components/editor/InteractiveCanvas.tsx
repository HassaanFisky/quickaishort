"use client";

import { useEditorStore, EditorElement, StickerElement, ZoomElement, TrimElement } from "@/stores/editorStore";
import { InteractiveTextNode } from "./InteractiveTextNode";
import { X } from "lucide-react";

// Renders the Pillar-1 `elements` array on top of the video canvas.
// The older CanvasLayer (canvasElements) remains mounted beside this component.
export function InteractiveCanvas() {
  const { elements, selectedElementId, selectElement, updateElement, removeElement } = useEditorStore();

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      onClick={() => selectElement(null)}
    >
      {elements.map((el) => {
        if (el.type === "TEXT") {
          return (
            <InteractiveTextNode
              key={el.id}
              element={el}
              isSelected={selectedElementId === el.id}
              onSelect={() => selectElement(el.id)}
              onUpdate={(patch) => updateElement(el.id, patch)}
              onRemove={() => removeElement(el.id)}
            />
          );
        }
        if (el.type === "STICKER") {
          return <StickerNode key={el.id} element={el as StickerElement} isSelected={selectedElementId === el.id} onSelect={() => selectElement(el.id)} onRemove={() => removeElement(el.id)} />;
        }
        if (el.type === "ZOOM") {
          return <ZoomNode key={el.id} element={el as ZoomElement} isSelected={selectedElementId === el.id} onSelect={() => selectElement(el.id)} onRemove={() => removeElement(el.id)} />;
        }
        if (el.type === "TRIM") {
          return <TrimNode key={el.id} element={el as TrimElement} isSelected={selectedElementId === el.id} onSelect={() => selectElement(el.id)} onRemove={() => removeElement(el.id)} />;
        }
        return null;
      })}
    </div>
  );
}

function StickerNode({ element, isSelected, onSelect, onRemove }: { element: StickerElement; isSelected: boolean; onSelect: () => void; onRemove: () => void }) {
  return (
    <div
      className="absolute pointer-events-auto cursor-pointer select-none group"
      style={{ transform: `translate(${element.x}px, ${element.y}px) rotate(${element.rotation}deg) scale(${element.scale})` }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isSelected && (
        <button
          className="absolute -top-6 -right-2 z-50 w-5 h-5 bg-red-500/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
      <span className="text-5xl drop-shadow-2xl">{element.emoji}</span>
    </div>
  );
}

function ZoomNode({ element, isSelected, onSelect, onRemove }: { element: ZoomElement; isSelected: boolean; onSelect: () => void; onRemove: () => void }) {
  return (
    <div
      className="absolute pointer-events-auto cursor-crosshair group"
      style={{ transform: `translate(${element.x - 16}px, ${element.y - 16}px)` }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isSelected && (
        <button
          className="absolute -top-6 -right-2 z-50 w-5 h-5 bg-red-500/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
      <div className={`w-8 h-8 rounded-full border-2 ${isSelected ? "border-primary" : "border-primary/50"} bg-primary/20 flex items-center justify-center`}>
        <span className="text-[10px] font-black text-primary">Z</span>
      </div>
    </div>
  );
}

function TrimNode({ element, isSelected, onSelect, onRemove }: { element: TrimElement; isSelected: boolean; onSelect: () => void; onRemove: () => void }) {
  return (
    <div
      className="absolute pointer-events-auto cursor-pointer group"
      style={{ transform: `translate(${element.x}px, ${element.y}px)` }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isSelected && (
        <button
          className="absolute -top-6 -right-2 z-50 w-5 h-5 bg-red-500/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
      <div className={`px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-wider ${isSelected ? "border-amber-400 bg-amber-400/20 text-amber-400" : "border-amber-400/40 bg-amber-400/10 text-amber-400/70"}`}>
        ✂ {element.startTime.toFixed(1)}s–{element.endTime.toFixed(1)}s
      </div>
    </div>
  );
}
