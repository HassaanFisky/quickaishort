#!/usr/bin/env node
/**
 * Pillar-1 structural validator.
 * Greps source files for required exports and patterns without transpiling TS.
 * Run: node scripts/validate-interactive-text.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "src");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(src, rel), "utf8");
  } catch {
    return null;
  }
}

function has(content, pattern) {
  if (!content) return false;
  if (typeof pattern === "string") return content.includes(pattern);
  return pattern.test(content);
}

// ── editorStore.ts ───────────────────────────────────────────────────────────
console.log("\n[1] editorStore.ts");
const store = read("stores/editorStore.ts");
assert(store !== null, "file exists");
assert(has(store, "EditorElementType"), "exports EditorElementType");
assert(has(store, '"TEXT" | "ZOOM" | "TRIM" | "STICKER"'), "EditorElementType has 4 literals");
assert(has(store, "interface TextElement"), "TextElement interface exists");
assert(has(store, "interface ZoomElement"), "ZoomElement interface exists");
assert(has(store, "interface TrimElement"), "TrimElement interface exists");
assert(has(store, "interface StickerElement"), "StickerElement interface exists");
assert(has(store, "type EditorElement ="), "EditorElement union type exported");
assert(has(store, "BaseEditorElement"), "BaseEditorElement interface exists");
assert(has(store, "elements: EditorElement[]"), "elements array in state");
assert(has(store, "selectedElementId: string | null"), "selectedElementId in state");
assert(has(store, "lastAddedElementId: string | null"), "lastAddedElementId in state");
assert(has(store, "addElement:"), "addElement action declared");
assert(has(store, "updateElement:"), "updateElement action declared");
assert(has(store, "removeElement:"), "removeElement action declared");
assert(has(store, "selectElement:"), "selectElement action declared");
assert(has(store, "addElement: (el)"), "addElement implemented");
assert(has(store, "updateElement: (id, patch)"), "updateElement implemented");
assert(has(store, "removeElement: (id)"), "removeElement implemented");
assert(has(store, "selectElement: (id)"), "selectElement implemented");
assert(has(store, "lastAddedElementId: id"), "addElement writes lastAddedElementId");
assert(has(store, 'case "ADD_ELEMENT"'), "dispatcher handles ADD_ELEMENT");
assert(has(store, 'case "UPDATE_ELEMENT"'), "dispatcher handles UPDATE_ELEMENT");
assert(has(store, 'case "REMOVE_ELEMENT"'), "dispatcher handles REMOVE_ELEMENT");
assert(has(store, "AiSnapshot"), "AiSnapshot interface defined");
assert(has(store, "aiUndoStack"), "aiUndoStack in state");
assert(has(store, "aiRedoStack"), "aiRedoStack in state");
assert(has(store, "pushAiSnapshot"), "pushAiSnapshot declared");
assert(has(store, "undoAiEdit"), "undoAiEdit declared");
assert(has(store, "redoAiEdit"), "redoAiEdit declared");
assert(has(store, "applyAiEdits"), "applyAiEdits declared");
assert(has(store, "_MAX_AI_STACK"), "AI stack bounded");

// ── InteractiveTextNode.tsx ──────────────────────────────────────────────────
console.log("\n[2] InteractiveTextNode.tsx");
const itn = read("components/editor/InteractiveTextNode.tsx");
assert(itn !== null, "file exists");
assert(has(itn, "export function InteractiveTextNode"), "named export");
assert(has(itn, "TextElement"), "uses TextElement type");
assert(has(itn, "useMotionValue"), "framer-motion drag via useMotionValue");
assert(has(itn, "drag"), "framer-motion drag enabled");
assert(has(itn, "onUpdate"), "onUpdate prop");
assert(has(itn, "onRemove"), "onRemove prop");
assert(has(itn, "onSelect"), "onSelect prop");
assert(has(itn, "isSelected"), "isSelected prop");
assert(has(itn, "contentEditable"), "text editing via contentEditable");
assert(has(itn, "handleResizeMouseDown"), "resize handle implemented");

// ── InteractiveCanvas.tsx ────────────────────────────────────────────────────
console.log("\n[3] InteractiveCanvas.tsx");
const ic = read("components/editor/InteractiveCanvas.tsx");
assert(ic !== null, "file exists");
assert(has(ic, "export function InteractiveCanvas"), "named export");
assert(has(ic, "InteractiveTextNode"), "mounts InteractiveTextNode for TEXT type");
assert(has(ic, 'el.type === "TEXT"'), "dispatches TEXT elements");
assert(has(ic, 'el.type === "STICKER"'), "dispatches STICKER elements");
assert(has(ic, 'el.type === "ZOOM"'), "dispatches ZOOM elements");
assert(has(ic, 'el.type === "TRIM"'), "dispatches TRIM elements");
assert(has(ic, "useEditorStore"), "reads from useEditorStore");
assert(has(ic, "selectElement"), "calls selectElement");
assert(has(ic, "removeElement"), "calls removeElement");

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Assertions: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nSome validation assertions FAILED. Fix the issues above.");
  process.exit(1);
} else {
  console.log("\nAll validation assertions passed. ✓");
}
