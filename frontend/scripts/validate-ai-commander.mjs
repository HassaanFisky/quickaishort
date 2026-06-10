#!/usr/bin/env node
/**
 * Pillar-3 structural validator.
 * Reads source files and asserts required exports/patterns.
 * Run: node scripts/validate-ai-commander.mjs
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

function readRoot(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

function has(content, pattern) {
  if (!content) return false;
  if (typeof pattern === "string") return content.includes(pattern);
  return pattern.test(content);
}

// ── types/ai-editor.ts ───────────────────────────────────────────────────────
console.log("\n[1] types/ai-editor.ts");
const types = read("types/ai-editor.ts");
assert(types !== null, "file exists");
assert(has(types, "export type AiEditorAction"), "exports AiEditorAction union");
assert(has(types, "export interface AiEditorRequest"), "exports AiEditorRequest");
assert(has(types, "export interface AiEditorResponse"), "exports AiEditorResponse");
assert(has(types, "export function isAction"), "exports isAction helper");
assert(has(types, "AiEditorActionType"), "exports AiEditorActionType");
assert(has(types, "AiEditorCurrentState"), "exports AiEditorCurrentState");
assert(has(types, "AiEditorTranscriptChunk"), "exports AiEditorTranscriptChunk");
assert(has(types, '"ADD_ELEMENT"'), "ADD_ELEMENT action variant present");
assert(has(types, '"UPDATE_ELEMENT"'), "UPDATE_ELEMENT action variant present");
assert(has(types, '"REMOVE_ELEMENT"'), "REMOVE_ELEMENT action variant present");
assert(has(types, '"DETECT_VIRAL_MOMENTS"'), "DETECT_VIRAL_MOMENTS action variant present");
assert(has(types, '"GENERATE_HOOK_CAPTION"'), "GENERATE_HOOK_CAPTION action variant present");
assert(has(types, '"SUGGEST_STYLE_PRESET"'), "SUGGEST_STYLE_PRESET action variant present");
assert(has(types, '"EXPLAIN_LAST_EDIT"'), "EXPLAIN_LAST_EDIT action variant present");
assert(has(types, "Readonly<AiEditorAction[]>"), "actions array is Readonly");
assert(has(types, "used_mock: boolean"), "used_mock field present");
assert(has(types, "clamped: Readonly<string[]>"), "clamped report is Readonly");
assert(has(types, "dropped: Readonly<string[]>"), "dropped report is Readonly");

// ── lib/aiEditorClient.ts ─────────────────────────────────────────────────────
console.log("\n[2] lib/aiEditorClient.ts");
const client = read("lib/aiEditorClient.ts");
assert(client !== null, "file exists");
assert(has(client, "export async function callAiEditor"), "exports callAiEditor");
assert(has(client, "export class AiEditorAbortedError"), "exports AiEditorAbortedError");
assert(has(client, "export class AiEditorTimeoutError"), "exports AiEditorTimeoutError");
assert(has(client, "export class AiEditorNetworkError"), "exports AiEditorNetworkError");
assert(has(client, "export class AiEditorAuthError"), "exports AiEditorAuthError");
assert(has(client, "export class AiEditorRateLimitError"), "exports AiEditorRateLimitError");
assert(has(client, "export class AiEditorPaymentRequiredError"), "exports AiEditorPaymentRequiredError");
assert(has(client, "export class AiEditorServerError"), "exports AiEditorServerError");
assert(has(client, "export class AiEditorBadResponseError"), "exports AiEditorBadResponseError");
assert(has(client, "AbortController"), "uses AbortController for timeout");
assert(has(client, "TIMEOUT_MS"), "30s timeout constant defined");
assert(has(client, "validateEnvelope"), "response shape validation present");
assert(has(client, "X-Idempotency-Key"), "idempotency key header forwarded");
assert(has(client, "/api/ai/editor"), "POSTs to /api/ai/editor proxy");

// ── hooks/useAiCommander.ts ──────────────────────────────────────────────────
console.log("\n[3] hooks/useAiCommander.ts");
const hook = read("hooks/useAiCommander.ts");
assert(hook !== null, "file exists");
assert(has(hook, "export function useAiCommander"), "exports useAiCommander");
assert(has(hook, "useEditorStore"), "imports useEditorStore");
assert(has(hook, "applyAiEdits"), "calls applyAiEdits");
assert(has(hook, "AbortController"), "uses AbortController");
assert(has(hook, "AiEditorAbortedError"), "handles AiEditorAbortedError");
assert(has(hook, "AiEditorAuthError"), "handles AiEditorAuthError");
assert(has(hook, "AiEditorPaymentRequiredError"), "handles AiEditorPaymentRequiredError");
assert(has(hook, "AiEditorTimeoutError"), "handles AiEditorTimeoutError");
assert(has(hook, "needs_clarification"), "handles clarification_needed status");
assert(has(hook, "canUndo"), "exposes canUndo");
assert(has(hook, "canRedo"), "exposes canRedo");
assert(has(hook, "isMockResponse"), "exposes isMockResponse");
assert(has(hook, "setExecutionOverlay"), "calls setExecutionOverlay");
assert(has(hook, "idempotencyKey"), "generates idempotency key");
assert(has(hook, "duration === 0"), "guards against no-video state (E1)");

// ── stores/editorStore.ts — AI undo + dispatcher ─────────────────────────────
console.log("\n[4] stores/editorStore.ts (Pillar-3 additions)");
const store = read("stores/editorStore.ts");
assert(store !== null, "file exists");
assert(has(store, 'case "ADD_ELEMENT"'), "dispatcher handles ADD_ELEMENT");
assert(has(store, 'case "UPDATE_ELEMENT"'), "dispatcher handles UPDATE_ELEMENT");
assert(has(store, 'case "REMOVE_ELEMENT"'), "dispatcher handles REMOVE_ELEMENT");
assert(has(store, 'case "DETECT_VIRAL_MOMENTS"'), "dispatcher handles DETECT_VIRAL_MOMENTS");
assert(has(store, 'case "GENERATE_HOOK_CAPTION"'), "dispatcher handles GENERATE_HOOK_CAPTION");
assert(has(store, 'case "SUGGEST_STYLE_PRESET"'), "dispatcher handles SUGGEST_STYLE_PRESET");
assert(has(store, 'case "EXPLAIN_LAST_EDIT"'), "dispatcher handles EXPLAIN_LAST_EDIT");
assert(has(store, "aiUndoStack"), "aiUndoStack state field");
assert(has(store, "aiRedoStack"), "aiRedoStack state field");
assert(has(store, "applyAiEdits"), "applyAiEdits action");
assert(has(store, "pushAiSnapshot"), "pushAiSnapshot action");
assert(has(store, "undoAiEdit"), "undoAiEdit action");
assert(has(store, "redoAiEdit"), "redoAiEdit action");
assert(has(store, "structuredClone"), "uses structuredClone for deep copy");
assert(has(store, "_MAX_AI_STACK"), "stack bounded");
assert(
  has(store, "const { type, ...rest }"),
  "applyAiEdits uses destructuring to strip discriminant",
);
assert(
  has(store, "{ type, payload: rest }") ||
    has(store, "{ type: type, payload: rest }"),
  "applyAiEdits wraps payload as { type, payload: rest }",
);

// ── stores/aiPanelStore.ts ───────────────────────────────────────────────────
console.log("\n[5] stores/aiPanelStore.ts");
const panel = read("stores/aiPanelStore.ts");
assert(panel !== null, "file exists");
assert(has(panel, "aiPanelMode"), "aiPanelMode field");
assert(has(panel, "setAiPanelMode"), "setAiPanelMode action");
assert(has(panel, "executionOverlay"), "executionOverlay field");
assert(has(panel, "setExecutionOverlay"), "setExecutionOverlay action");

// ── app/api/ai/editor/route.ts — no direct Gemini, has proxy ─────────────────
console.log("\n[6] app/api/ai/editor/route.ts");
const route = read("app/api/ai/editor/route.ts");
assert(route !== null, "file exists");
assert(!has(route, "@google/generative-ai"), "does NOT import @google/generative-ai (Gemini removed)");
assert(has(route, "/api/ai-edit"), "proxies to FastAPI /api/ai-edit");
assert(has(route, "getServerSession"), "uses NextAuth getServerSession");
assert(has(route, "Authorization"), "forwards Authorization header");

// ── components/editor/AICopilot.tsx — imports commander ──────────────────────
console.log("\n[7] components/editor/AICopilot.tsx");
const copilot = read("components/editor/AICopilot.tsx");
assert(copilot !== null, "file exists");
assert(has(copilot, "useAiCommander"), "imports useAiCommander");
assert(has(copilot, "aiPanelMode"), "reads aiPanelMode");
assert(has(copilot, "canUndo"), "uses canUndo");
assert(has(copilot, "canRedo"), "uses canRedo");
assert(has(copilot, "isMockResponse"), "shows mock badge");
assert(has(copilot, "needs_clarification"), "handles clarification status");

// ── components/editor/VideoCanvas.tsx — execution overlay ────────────────────
console.log("\n[8] components/editor/VideoCanvas.tsx");
const canvas = read("components/editor/VideoCanvas.tsx");
assert(canvas !== null, "file exists");
assert(has(canvas, "executionOverlay"), "reads executionOverlay");
assert(has(canvas, "InteractiveCanvas"), "mounts InteractiveCanvas");

// ── [9] AI Tool Console ────────────────────────────────────────────────────────
console.log("\n[9] AI Tool Console (Pillar 3.8 B)");

const catalog = read("lib/aiToolCatalog.ts");
assert(catalog !== null, "lib/aiToolCatalog.ts exists");
assert(has(catalog, "AI_TOOL_CATALOG"), "exports AI_TOOL_CATALOG");
assert(has(catalog, "searchTools"), "exports searchTools helper");
assert(has(catalog, "ToolExecutionContext"), "defines ToolExecutionContext interface");
assert(has(catalog, "ToolExecutionMode"), "defines ToolExecutionMode type");
assert(has(catalog, "execMode"), "catalog entries have execMode field");
assert(has(catalog, "DETECT_VIRAL_MOMENTS"), "covers DETECT_VIRAL_MOMENTS tool");
assert(has(catalog, "GENERATE_HOOK_CAPTION"), "covers GENERATE_HOOK_CAPTION tool");
assert(has(catalog, "SUGGEST_STYLE_PRESET"), "covers SUGGEST_STYLE_PRESET tool");
assert(has(catalog, "EXPLAIN_LAST_EDIT"), "covers EXPLAIN_LAST_EDIT tool");

const aiCard = read("components/editor/AIToolCard.tsx");
assert(aiCard !== null, "components/editor/AIToolCard.tsx exists");
assert(has(aiCard, "AIToolCard"), "exports AIToolCard component");
assert(has(aiCard, "whileTap"), "has framer-motion tap animation");
assert(has(aiCard, "aria-label"), "has aria-label for accessibility");

const aiConsole = read("components/editor/AIToolConsole.tsx");
assert(aiConsole !== null, "components/editor/AIToolConsole.tsx exists");
assert(has(aiConsole, "searchTools"), "uses searchTools for palette filtering");
assert(has(aiConsole, "ArrowDown"), "has ArrowDown keyboard navigation");
assert(has(aiConsole, "ArrowUp"), "has ArrowUp keyboard navigation");
assert(has(aiConsole, "dispatchAIActions"), "calls dispatchAIActions for direct tools");
assert(has(aiConsole, "commander.execute"), "routes gemini tools via commander.execute");

const panelStore = read("stores/aiPanelStore.ts");
assert(panelStore !== null, "stores/aiPanelStore.ts exists");
assert(has(panelStore, "'tools'"), "aiPanelStore mode union includes 'tools'");

assert(has(copilot, "AIToolConsole"), "AICopilot imports AIToolConsole");
assert(has(copilot, '"tools"'), 'AICopilot renders tools tab');

const editorPage = read("app/editor/page.tsx");
assert(editorPage !== null, "app/editor/page.tsx exists");
assert(has(editorPage, "useAIPanel"), "editor page imports useAIPanel");
assert(has(editorPage, 'setAiPanelMode("tools")'), 'Cmd+K sets aiPanelMode to tools');

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Assertions: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nSome validation assertions FAILED. Fix the issues above.");
  process.exit(1);
} else {
  console.log("\nAll validation assertions passed. ✓");
}
