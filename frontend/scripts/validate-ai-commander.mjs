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
const repoRoot = path.resolve(__dirname, "../..");
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
    return fs.readFileSync(path.join(repoRoot, rel), "utf8");
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

// ── [10] Phase 3a — Multi-track timeline + B-Roll ────────────────────────────
console.log("\n[10] Phase 3a: B-Roll, Overlay, Multi-track timeline");

// types/ai-editor.ts
assert(has(types, '"ADD_BROLL"'), 'ADD_BROLL action type present in ai-editor.ts');
assert(has(types, '"ADD_VIDEO_OVERLAY"'), 'ADD_VIDEO_OVERLAY action type present');
assert(has(types, '"REMOVE_OVERLAY"'), 'REMOVE_OVERLAY action type present');
assert(has(types, '"BROLL_OPEN_LIBRARY"'), 'BROLL_OPEN_LIBRARY action type present');
assert(has(types, '"BROLL_CLEAR_ALL"'), 'BROLL_CLEAR_ALL action type present');
assert(has(types, 'interface BRollClip'), 'BRollClip interface exported');
assert(has(types, 'OverlayPosition'), 'OverlayPosition type exported');

// stores/editorStore.ts
assert(has(store, '"VIDEO_OVERLAY"'), 'editorStore has VIDEO_OVERLAY element type');
assert(has(store, '"BROLL"'), 'editorStore has BROLL element type');
assert(has(store, 'isBRollDrawerOpen'), 'isBRollDrawerOpen state field present');
assert(has(store, 'setBRollDrawerOpen'), 'setBRollDrawerOpen action present');
assert(has(store, 'case "ADD_BROLL"'), 'dispatcher handles ADD_BROLL');
assert(has(store, 'case "BROLL_OPEN_LIBRARY"'), 'dispatcher handles BROLL_OPEN_LIBRARY');
assert(has(store, 'case "BROLL_CLEAR_ALL"'), 'dispatcher handles BROLL_CLEAR_ALL');

// lib/brollClient.ts
const brollClient = read("lib/brollClient.ts");
assert(brollClient !== null, 'lib/brollClient.ts exists');
assert(has(brollClient, 'BRollSearchError'), 'exports BRollSearchError class');
assert(has(brollClient, 'searchBRoll'), 'exports searchBRoll function');
assert(has(brollClient, 'AbortController'), 'uses AbortController for timeout');
assert(has(brollClient, '/api/broll/search'), 'hits /api/broll/search endpoint');

// components/editor/BRollDrawer.tsx
const brollDrawer = read("components/editor/BRollDrawer.tsx");
assert(brollDrawer !== null, 'components/editor/BRollDrawer.tsx exists');
assert(has(brollDrawer, 'BRollDrawer'), 'exports BRollDrawer component');
assert(has(brollDrawer, 'isBRollDrawerOpen'), 'reads isBRollDrawerOpen from store');
assert(has(brollDrawer, 'ADD_BROLL'), 'dispatches ADD_BROLL action');
assert(has(brollDrawer, 'fixed bottom-0'), 'uses fixed positioning');

// components/editor/MultiTrackTimeline.tsx
const multiTrack = read("components/editor/MultiTrackTimeline.tsx");
assert(multiTrack !== null, 'components/editor/MultiTrackTimeline.tsx exists');
assert(has(multiTrack, 'MultiTrackTimeline'), 'exports MultiTrackTimeline component');
assert(has(multiTrack, '"BROLL"'), 'renders BROLL lane');
assert(has(multiTrack, '"VIDEO_OVERLAY"'), 'renders VIDEO_OVERLAY lane');
assert(has(multiTrack, 'return null'), 'collapses when both lanes empty');

// app/editor/page.tsx
assert(has(editorPage, 'BRollDrawer'), 'editor page mounts BRollDrawer');
assert(has(editorPage, 'setBRollDrawerOpen'), 'Cmd+B handler opens drawer');

// lib/aiToolCatalog.ts
assert(has(catalog, 'broll-open-library'), 'catalog has broll-open-library tool');
assert(has(catalog, 'broll-ai-suggest'), 'catalog has broll-ai-suggest tool');
assert(has(catalog, 'broll-clear-all'), 'catalog has broll-clear-all tool');
assert(has(catalog, 'overlay-pip-tl'), 'catalog has overlay-pip-tl tool');
assert(has(catalog, 'overlay-pip-tr'), 'catalog has overlay-pip-tr tool');
assert(has(catalog, 'overlay-split-50'), 'catalog has overlay-split-50 tool');

// ── [10b] Chrome-safe shortcut audit ─────────────────────────────────────────
console.log("\n[10b] Chrome-safe shortcut audit (Slice 0)");

const shortcuts = read("lib/shortcuts.ts");
assert(shortcuts !== null, 'lib/shortcuts.ts exists');
assert(has(shortcuts, 'export const SHORTCUTS'), 'exports SHORTCUTS map');
assert(has(shortcuts, 'export function isChromeReserved'), 'exports isChromeReserved function');
assert(has(shortcuts, '"Ctrl+K"'), 'reserved set includes Ctrl+K');
assert(has(shortcuts, '"Ctrl+J"'), 'reserved set includes Ctrl+J');
assert(has(shortcuts, '"Ctrl+T"'), 'reserved set includes Ctrl+T');
assert(has(catalog, 'Shift+Alt+B'), 'broll-open-library shortcut updated to Shift+Alt+B');
assert(has(catalog, 'Shift+Alt+P') || has(editorPage, 'toggleCommandPalette'), 'command palette uses Shift+Alt+P');

// ── [11] Floating chat overlay (Slice A) ─────────────────────────────────────
console.log("\n[11] Floating chat overlay (Slice A)");

// panelStore already declared in [10b]
assert(has(panelStore, 'isFloatingChatOpen'), 'isFloatingChatOpen state in aiPanelStore');
assert(has(panelStore, 'toggleFloatingChat'), 'toggleFloatingChat action in aiPanelStore');
assert(has(panelStore, 'setFloatingChatOpen'), 'setFloatingChatOpen action in aiPanelStore');

const launcher = read("components/editor/FloatingChatLauncher.tsx");
assert(launcher !== null, 'components/editor/FloatingChatLauncher.tsx exists');
assert(has(launcher, "from \"@/lib/shortcuts\"") || has(launcher, "from '@/lib/shortcuts'"), 'FloatingChatLauncher imports from shortcuts.ts');
assert(has(launcher, '"toggleFloatingChat"') || has(launcher, "'toggleFloatingChat'"), 'FloatingChatLauncher uses toggleFloatingChat shortcut id');
assert(has(launcher, 'Escape') && has(launcher, 'isContentEditable'), 'Esc handler checks input focus before closing');
assert(has(launcher, 'prefers-reduced-motion'), 'prefers-reduced-motion branch present');

const persist = read("lib/transcriptPersistence.ts");
assert(persist !== null, 'lib/transcriptPersistence.ts exists');
assert(has(persist, '"quickeditor.v1"'), 'IndexedDB database name quickeditor.v1 present');
assert(has(persist, '"agent_transcripts"'), 'IndexedDB store name agent_transcripts present');
assert(has(persist, '50'), 'MAX_TURNS = 50 cap present in transcriptPersistence.ts');

assert(has(editorPage, 'FloatingChatLauncher'), 'FloatingChatLauncher mounted in editor/page.tsx');

const chatTranscript = read("components/editor/ChatTranscript.tsx");
assert(chatTranscript !== null, 'components/editor/ChatTranscript.tsx exists');
// copilot already declared above
assert(has(copilot, 'ChatTranscript'), 'AICopilot imports ChatTranscript');
assert(has(launcher, 'ChatTranscript'), 'FloatingChatLauncher imports ChatTranscript (shared transcript)');

// ── [12] Auto-remove silences (Slice B) ──────────────────────────────────────
console.log("\n[12] Auto-remove silences (Slice B)");

const pyModels = readRoot("fastapi/models/ai_editor.py");
assert(has(pyModels, 'REMOVE_SILENCES'), 'REMOVE_SILENCES action in fastapi/models/ai_editor.py');
assert(has(pyModels, 'min_silence_sec'), 'min_silence_sec field in RemoveSilencesAction');
assert(has(pyModels, '0.6'), 'default min_silence_sec = 0.6 present');
assert(has(pyModels, '0.08'), 'default padding_sec = 0.08 present');

const pySanitiser = readRoot("fastapi/services/ai_editor_sanitiser.py");
assert(has(pySanitiser, 'REMOVE_SILENCES'), 'sanitiser branch handles REMOVE_SILENCES');

assert(has(types, '"REMOVE_SILENCES"'), 'REMOVE_SILENCES in frontend ai-editor.ts union');
assert(has(catalog, 'audio-remove-silences'), 'catalog has audio-remove-silences tool');
assert(has(catalog, 'audio-remove-silences-quick'), 'catalog has audio-remove-silences-quick tool');

// ── [13] WebGPU Phase 4a — compositor + feature flags + preview layer ─────────
console.log("\n[13] WebGPU Phase 4a");

const compositor = read("lib/webgpu/compositor.ts");
assert(compositor !== null, 'lib/webgpu/compositor.ts exists');
assert(has(compositor, 'class WebGpuCompositor'), 'WebGpuCompositor class defined');
assert(has(compositor, 'static async isSupported'), 'isSupported static method');
assert(has(compositor, 'async drawVideoFrame('), 'drawVideoFrame() method');
assert(has(compositor, 'copyExternalImageToTexture'), 'uses copyExternalImageToTexture');
assert(has(compositor, 'WGSL_SHADER'), 'WGSL shader constant');

const featureFlags = read("lib/featureFlags.ts");
assert(featureFlags !== null, 'lib/featureFlags.ts exists');
assert(has(featureFlags, 'quickeditor.v1'), 'uses quickeditor.v1 DB name');
assert(has(featureFlags, 'export async function getFlag'), 'exports getFlag');

const webgpuLayer = read("components/editor/WebGpuPreviewLayer.tsx");
assert(webgpuLayer !== null, 'components/editor/WebGpuPreviewLayer.tsx exists');
assert(has(webgpuLayer, 'prefers-reduced-motion'), 'WebGpuPreviewLayer respects prefers-reduced-motion');
assert(has(editorPage, 'WebGpuPreviewLayer'), 'WebGpuPreviewLayer mounted in editor/page.tsx');

// ── [14] Phase 4a-USER-FLOW — engaging surface refactor ───────────────────────
console.log("\n[14] Phase 4a-USER-FLOW");

const ytInputStrip = read("components/editor/YouTubeInputStrip.tsx");
assert(ytInputStrip !== null, 'components/editor/YouTubeInputStrip.tsx exists');

const editorLayout = read("components/editor/EditorLayout.tsx");
assert(has(editorLayout, 'YouTubeInputStrip'), 'EditorLayout imports/uses YouTubeInputStrip');
assert(has(editorLayout, 'advanced'), 'EditorLayout gates panels behind ?advanced=1');

const onboardingTourFile = read("components/editor/OnboardingTour.tsx");
assert(onboardingTourFile === null, 'OnboardingTour.tsx deleted');

// launcher already declared in [11]
assert(has(launcher, '-translate-x-1/2'), 'FloatingChatLauncher is center-aligned');

assert(has(editorPage, 'NODE_ENV'), 'TelemetryDock gated behind NODE_ENV in editor/page.tsx');

// ── [15] Phase 4b-MANUAL-TOOLS — 8 NLE timeline tool actions ─────────────────
console.log("\n[15] Phase 4b-MANUAL-TOOLS");

// Pydantic models
const pyModels15 = readRoot("fastapi/models/ai_editor.py");
assert(has(pyModels15, 'POINTER_SELECT'), 'POINTER_SELECT variant in fastapi/models/ai_editor.py');
assert(has(pyModels15, 'BLADE_SPLIT'),    'BLADE_SPLIT variant in fastapi/models/ai_editor.py');
assert(has(pyModels15, 'RIPPLE_TRIM'),    'RIPPLE_TRIM variant in fastapi/models/ai_editor.py');
assert(has(pyModels15, 'ROLLING_TRIM'),   'ROLLING_TRIM variant in fastapi/models/ai_editor.py');
assert(has(pyModels15, 'SLIP_CLIP'),      'SLIP_CLIP variant in fastapi/models/ai_editor.py');
assert(has(pyModels15, 'SLIDE_CLIP'),     'SLIDE_CLIP variant in fastapi/models/ai_editor.py');
assert(has(pyModels15, 'RIPPLE_DELETE'),  'RIPPLE_DELETE variant in fastapi/models/ai_editor.py');
assert(has(pyModels15, 'DURATION_STRETCH'), 'DURATION_STRETCH variant in fastapi/models/ai_editor.py');

// TypeScript mirrors
assert(has(types, '"POINTER_SELECT"'),    'POINTER_SELECT in frontend ai-editor.ts');
assert(has(types, '"BLADE_SPLIT"'),       'BLADE_SPLIT in frontend ai-editor.ts');
assert(has(types, '"RIPPLE_TRIM"'),       'RIPPLE_TRIM in frontend ai-editor.ts');
assert(has(types, '"RIPPLE_DELETE"'),     'RIPPLE_DELETE in frontend ai-editor.ts');
assert(has(types, '"DURATION_STRETCH"'),  'DURATION_STRETCH in frontend ai-editor.ts');

// editorStore
const editorStore = read("stores/editorStore.ts");
assert(has(editorStore, 'ToolId'), 'ToolId exported from editorStore.ts');
assert(has(editorStore, 'activeTimelineTool'), 'activeTimelineTool state in editorStore.ts');
assert(has(editorStore, 'setActiveTimelineTool'), 'setActiveTimelineTool action in editorStore.ts');

// TimelineToolbar component
const toolbar = read("components/editor/TimelineToolbar.tsx");
assert(toolbar !== null, 'components/editor/TimelineToolbar.tsx exists');
assert(has(toolbar, 'TOOLS'), 'TimelineToolbar defines TOOLS array');

// ── [16] Phase 4c WebCodecs export ───────────────────────────────────────────
console.log("\n[16] Phase 4c WebCodecs export");

const webCodecsExp = read("lib/export/webCodecsExporter.ts");
assert(webCodecsExp !== null, "lib/export/webCodecsExporter.ts exists");
assert(has(webCodecsExp, "WebCodecsExporter"), "WebCodecsExporter class in webCodecsExporter.ts");
assert(has(webCodecsExp, "isSupported"), "static isSupported() in webCodecsExporter.ts");
assert(has(webCodecsExp, "encodeFrameAt"), "encodeFrameAt method in webCodecsExporter.ts");
assert(has(webCodecsExp, "finalize"), "finalize method in webCodecsExporter.ts");

const mp4Mux = read("lib/export/mp4Mux.ts");
assert(mp4Mux !== null, "lib/export/mp4Mux.ts exists");
assert(has(mp4Mux, "mp4-muxer"), "mp4-muxer imported in mp4Mux.ts");

const exportWorker = read("workers/exportWorker.ts");
assert(exportWorker !== null, "workers/exportWorker.ts exists");

const exportDialog = read("components/editor/ExportDialog.tsx");
assert(exportDialog !== null, "components/editor/ExportDialog.tsx exists");
assert(has(exportDialog, "webcodecs_export_enabled"), "webcodecs_export_enabled flag referenced in ExportDialog");

const catalogExport = read("lib/aiToolCatalog.ts");
assert(has(catalogExport, "export-webcodecs-mp4"), "export-webcodecs-mp4 in aiToolCatalog");

const editorLayoutExport = read("components/editor/EditorLayout.tsx");
assert(has(editorLayoutExport, "ExportDialog"), "ExportDialog imported/used in EditorLayout");

// ── [17] Phase 4b-wave-2 — 14 additional NLE tools ───────────────────────────
console.log("\n[17] Phase 4b-wave-2 NLE tools (14)");

const pyModels17 = readRoot("fastapi/models/ai_editor.py");
assert(has(pyModels17, "FORWARD_LANE_SELECT"),   "FORWARD_LANE_SELECT in ai_editor.py");
assert(has(pyModels17, "BACKWARD_LANE_SELECT"),  "BACKWARD_LANE_SELECT in ai_editor.py");
assert(has(pyModels17, "MARK_IN"),               "MARK_IN in ai_editor.py");
assert(has(pyModels17, "MARK_OUT"),              "MARK_OUT in ai_editor.py");
assert(has(pyModels17, "CLIP_RANGE_MARK"),       "CLIP_RANGE_MARK in ai_editor.py");
assert(has(pyModels17, "RANGE_MARK"),            "RANGE_MARK in ai_editor.py");
assert(has(pyModels17, "EXTRACT"),               "EXTRACT in ai_editor.py");
assert(has(pyModels17, "LIFT"),                  "LIFT in ai_editor.py");
assert(has(pyModels17, "INSERT_EDIT"),           "INSERT_EDIT in ai_editor.py");
assert(has(pyModels17, "OVERWRITE_EDIT"),        "OVERWRITE_EDIT in ai_editor.py");
assert(has(pyModels17, "SWAP_CLIP"),             "SWAP_CLIP in ai_editor.py");
assert(has(pyModels17, "SCROLL_HAND"),           "SCROLL_HAND in ai_editor.py");
assert(has(pyModels17, "TIMELINE_ZOOM"),         "TIMELINE_ZOOM in ai_editor.py");
assert(has(pyModels17, "MAGNETIC_SNAP_TOGGLE"),  "MAGNETIC_SNAP_TOGGLE in ai_editor.py");

assert(has(types, '"FORWARD_LANE_SELECT"'),   "FORWARD_LANE_SELECT in ai-editor.ts");
assert(has(types, '"BACKWARD_LANE_SELECT"'),  "BACKWARD_LANE_SELECT in ai-editor.ts");
assert(has(types, '"MARK_IN"'),               "MARK_IN in ai-editor.ts");
assert(has(types, '"MARK_OUT"'),              "MARK_OUT in ai-editor.ts");
assert(has(types, '"CLIP_RANGE_MARK"'),       "CLIP_RANGE_MARK in ai-editor.ts");
assert(has(types, '"RANGE_MARK"'),            "RANGE_MARK in ai-editor.ts");
assert(has(types, '"EXTRACT"'),               "EXTRACT in ai-editor.ts");
assert(has(types, '"LIFT"'),                  "LIFT in ai-editor.ts");
assert(has(types, '"INSERT_EDIT"'),           "INSERT_EDIT in ai-editor.ts");
assert(has(types, '"OVERWRITE_EDIT"'),        "OVERWRITE_EDIT in ai-editor.ts");
assert(has(types, '"SWAP_CLIP"'),             "SWAP_CLIP in ai-editor.ts");
assert(has(types, '"SCROLL_HAND"'),           "SCROLL_HAND in ai-editor.ts");
assert(has(types, '"TIMELINE_ZOOM"'),         "TIMELINE_ZOOM in ai-editor.ts");
assert(has(types, '"MAGNETIC_SNAP_TOGGLE"'),  "MAGNETIC_SNAP_TOGGLE in ai-editor.ts");

// ── [18] Phase 3b — Color Suite ──────────────────────────────────────────────
console.log("\n[18] Phase 3b Color Suite");

const wgslShader = read("lib/webgpu/shaders/colorCorrection.wgsl.ts");
assert(wgslShader !== null, "lib/webgpu/shaders/colorCorrection.wgsl.ts exists");
assert(has(wgslShader, "COLOR_CORRECTION_WGSL"), "COLOR_CORRECTION_WGSL exported from shader file");
assert(has(wgslShader, "REC709_LUMA"), "REC709_LUMA constant in WGSL shader");
assert(has(wgslShader, "apply_cdl"), "apply_cdl CDL function in WGSL shader");
assert(has(wgslShader, "texture_3d"), "texture_3d LUT binding in WGSL shader");
assert(has(wgslShader, "defaultColorParamsBuffer"), "defaultColorParamsBuffer helper exported");

const colorPipeline = read("lib/webgpu/colorPipeline.ts");
assert(colorPipeline !== null, "lib/webgpu/colorPipeline.ts exists");
assert(has(colorPipeline, "// @ts-nocheck"), "colorPipeline.ts has @ts-nocheck for WebGPU types");
assert(has(colorPipeline, "ColorPipeline"), "ColorPipeline class in colorPipeline.ts");
assert(has(colorPipeline, "isSupported"), "isSupported static method in ColorPipeline");

const colorSuite = read("components/editor/panels/ColorSuite.tsx");
assert(colorSuite !== null, "components/editor/panels/ColorSuite.tsx exists");
assert(has(colorSuite, "setClipColor"), "setClipColor used in ColorSuite");

const pyModels18 = readRoot("fastapi/models/ai_editor.py");
assert(has(pyModels18, "COLOR_WHEELS"),     "COLOR_WHEELS in ai_editor.py");
assert(has(pyModels18, "COLOR_CURVES"),     "COLOR_CURVES in ai_editor.py");
assert(has(pyModels18, "HSL_SECONDARIES"),  "HSL_SECONDARIES in ai_editor.py");
assert(has(pyModels18, "APPLY_LUT"),        "APPLY_LUT in ai_editor.py");
assert(has(pyModels18, "RESET_COLOR"),      "RESET_COLOR in ai_editor.py");

assert(has(types, '"COLOR_WHEELS"'),    "COLOR_WHEELS in ai-editor.ts");
assert(has(types, '"COLOR_CURVES"'),    "COLOR_CURVES in ai-editor.ts");
assert(has(types, '"HSL_SECONDARIES"'), "HSL_SECONDARIES in ai-editor.ts");
assert(has(types, '"APPLY_LUT"'),       "APPLY_LUT in ai-editor.ts");
assert(has(types, '"RESET_COLOR"'),     "RESET_COLOR in ai-editor.ts");

const catalogColor = read("lib/aiToolCatalog.ts");
assert(has(catalogColor, '"Color"'), '"Color" category in aiToolCatalog');
assert(has(catalogColor, "color-wheels"),  "color-wheels in aiToolCatalog");
assert(has(catalogColor, "apply-lut"),     "apply-lut in aiToolCatalog");
assert(has(catalogColor, "reset-color"),   "reset-color in aiToolCatalog");

// ── [19] Phase 4 — OPFS + FFmpeg.wasm decoder ────────────────────────────────
console.log("\n[19] Phase 4 OPFS + FFmpeg.wasm");

const opfsStorage = read("lib/decode/opfsStorage.ts");
assert(opfsStorage !== null, "lib/decode/opfsStorage.ts exists");
assert(has(opfsStorage, "opfsWrite"), "opfsWrite exported from opfsStorage");
assert(has(opfsStorage, "opfsRead"),  "opfsRead exported from opfsStorage");
assert(has(opfsStorage, "opfsClear"), "opfsClear exported from opfsStorage");

const ffmpegDecoder = read("lib/decode/ffmpegWasmDecoder.ts");
assert(ffmpegDecoder !== null, "lib/decode/ffmpegWasmDecoder.ts exists");
assert(has(ffmpegDecoder, "// @ts-nocheck"), "ffmpegWasmDecoder.ts has @ts-nocheck");
assert(has(ffmpegDecoder, "ffmpegDecode"),   "ffmpegDecode exported from ffmpegWasmDecoder");
assert(has(ffmpegDecoder, "LOAD_TIMEOUT_MS"), "LOAD_TIMEOUT_MS CDN-block timeout constant present");

const decoderWorker = read("workers/decoderWorker.ts");
assert(decoderWorker !== null, "workers/decoderWorker.ts exists");
assert(has(decoderWorker, "// @ts-nocheck"), "decoderWorker.ts has @ts-nocheck");

const nextCfg = read("../next.config.mjs");
assert(has(nextCfg, '"/adk/:path*"'), "COOP/COEP headers extended to /adk in next.config.mjs");

// ── [20] Phase 5 — Web Audio multi-bus + RNNoise ─────────────────────────────
console.log("\n[20] Phase 5 Web Audio multi-bus + RNNoise");

const mixGraph = read("lib/audio/mixGraph.ts");
assert(mixGraph !== null, "lib/audio/mixGraph.ts exists");
assert(has(mixGraph, "MixGraph"),        "MixGraph class in mixGraph.ts");
assert(has(mixGraph, "rnnoise"),         "rnnoise worklet reference in mixGraph.ts");
assert(has(mixGraph, "enableLimiter"),   "enableLimiter method in MixGraph");

const automation = read("lib/audio/automation.ts");
assert(automation !== null, "lib/audio/automation.ts exists");
assert(has(automation, "applyAutomation"), "applyAutomation exported from automation.ts");
assert(has(automation, "buildFadeIn"),     "buildFadeIn exported from automation.ts");
assert(has(automation, "buildFadeOut"),    "buildFadeOut exported from automation.ts");

const rnnoiseWorklet = read("lib/audio/worklets/rnnoiseWorklet.ts");
assert(rnnoiseWorklet !== null, "lib/audio/worklets/rnnoiseWorklet.ts exists");
assert(has(rnnoiseWorklet, "// @ts-nocheck"), "rnnoiseWorklet.ts has @ts-nocheck");
assert(has(rnnoiseWorklet, "rnnoise-worklet"), "rnnoise-worklet processor name registered");

const limiterWorklet = read("lib/audio/worklets/limiterWorklet.ts");
assert(limiterWorklet !== null, "lib/audio/worklets/limiterWorklet.ts exists");
assert(has(limiterWorklet, "limiter-worklet"), "limiter-worklet processor name registered");

const pyModels20 = readRoot("fastapi/models/ai_editor.py");
assert(has(pyModels20, "SET_CLIP_GAIN"),   "SET_CLIP_GAIN in ai_editor.py");
assert(has(pyModels20, "SET_MASTER_GAIN"), "SET_MASTER_GAIN in ai_editor.py");
assert(has(pyModels20, "ENABLE_DENOISE"),  "ENABLE_DENOISE in ai_editor.py");
assert(has(pyModels20, "ENABLE_LIMITER"),  "ENABLE_LIMITER in ai_editor.py");
assert(has(pyModels20, "ADD_FADE_IN"),     "ADD_FADE_IN in ai_editor.py");
assert(has(pyModels20, "ADD_FADE_OUT"),    "ADD_FADE_OUT in ai_editor.py");

const editorLayoutAttrib = read("components/editor/EditorLayout.tsx");
assert(has(editorLayoutAttrib, "mozilla/rnnoise"), "RNNoise attribution link in EditorLayout footer");

// ── [21] Phase 6 — Masking suite ─────────────────────────────────────────────
console.log("\n[21] Phase 6 Masking suite");

const maskTypes = read("lib/masking/maskTypes.ts");
assert(maskTypes !== null, "lib/masking/maskTypes.ts exists");
assert(has(maskTypes, "RectMask"),       "RectMask interface in maskTypes.ts");
assert(has(maskTypes, "EllipseMask"),    "EllipseMask interface in maskTypes.ts");
assert(has(maskTypes, "BezierMask"),     "BezierMask interface in maskTypes.ts");
assert(has(maskTypes, "AiPersonMask"),   "AiPersonMask interface in maskTypes.ts");

const maskRenderer = read("lib/masking/maskRenderer.ts");
assert(maskRenderer !== null, "lib/masking/maskRenderer.ts exists");
assert(has(maskRenderer, "renderMasks"),     "renderMasks exported from maskRenderer.ts");
assert(has(maskRenderer, "applyMaskAsAlpha"),"applyMaskAsAlpha exported from maskRenderer.ts");

const pyModels21 = readRoot("fastapi/models/ai_editor.py");
assert(has(pyModels21, "ADD_RECT_MASK"),      "ADD_RECT_MASK in ai_editor.py");
assert(has(pyModels21, "ADD_ELLIPSE_MASK"),   "ADD_ELLIPSE_MASK in ai_editor.py");
assert(has(pyModels21, "ADD_BEZIER_MASK"),    "ADD_BEZIER_MASK in ai_editor.py");
assert(has(pyModels21, "ADD_AI_PERSON_MASK"), "ADD_AI_PERSON_MASK in ai_editor.py");
assert(has(pyModels21, "CLEAR_MASKS"),        "CLEAR_MASKS in ai_editor.py");

assert(has(types, '"ADD_RECT_MASK"'),      "ADD_RECT_MASK in ai-editor.ts");
assert(has(types, '"ADD_BEZIER_MASK"'),    "ADD_BEZIER_MASK in ai-editor.ts");
assert(has(types, '"ADD_AI_PERSON_MASK"'), "ADD_AI_PERSON_MASK in ai-editor.ts");
assert(has(types, '"CLEAR_MASKS"'),        "CLEAR_MASKS in ai-editor.ts");

const catalogMask = read("lib/aiToolCatalog.ts");
assert(has(catalogMask, "mask-rect"),       "mask-rect in aiToolCatalog");
assert(has(catalogMask, "mask-ai-person"),  "mask-ai-person in aiToolCatalog");
assert(has(catalogMask, "mask-clear"),      "mask-clear in aiToolCatalog");

// ── [22] Phase 7 — Motion keyframes ──────────────────────────────────────────
console.log("\n[22] Phase 7 Motion keyframes");

const kfTypes = read("lib/motion/keyframeTypes.ts");
assert(kfTypes !== null, "lib/motion/keyframeTypes.ts exists");
assert(has(kfTypes, "Keyframe"),           "Keyframe interface in keyframeTypes.ts");
assert(has(kfTypes, "PropertyTrack"),      "PropertyTrack interface in keyframeTypes.ts");
assert(has(kfTypes, "MotionPath"),         "MotionPath interface in keyframeTypes.ts");
assert(has(kfTypes, "interpolateTrack"),   "interpolateTrack exported from keyframeTypes.ts");
assert(has(kfTypes, "solveCubicBezier"),   "solveCubicBezier exported from keyframeTypes.ts");

const kfStore = read("lib/motion/keyframeStore.ts");
assert(kfStore !== null, "lib/motion/keyframeStore.ts exists");
assert(has(kfStore, "upsertKeyframe"),     "upsertKeyframe exported from keyframeStore.ts");
assert(has(kfStore, "deleteKeyframe"),     "deleteKeyframe exported from keyframeStore.ts");
assert(has(kfStore, "clearAllKeyframes"),  "clearAllKeyframes exported from keyframeStore.ts");
assert(has(kfStore, "serializeMotionPaths"), "serializeMotionPaths exported from keyframeStore.ts");

const pyModels22 = readRoot("fastapi/models/ai_editor.py");
assert(has(pyModels22, "SET_KEYFRAME"),    "SET_KEYFRAME in ai_editor.py");
assert(has(pyModels22, "DELETE_KEYFRAME"), "DELETE_KEYFRAME in ai_editor.py");
assert(has(pyModels22, "CLEAR_KEYFRAMES"), "CLEAR_KEYFRAMES in ai_editor.py");

assert(has(types, '"SET_KEYFRAME"'),       "SET_KEYFRAME in ai-editor.ts");
assert(has(types, '"DELETE_KEYFRAME"'),    "DELETE_KEYFRAME in ai-editor.ts");
assert(has(types, '"CLEAR_KEYFRAMES"'),    "CLEAR_KEYFRAMES in ai-editor.ts");

const catalogKf = read("lib/aiToolCatalog.ts");
assert(has(catalogKf, "set-keyframe"),     "set-keyframe in aiToolCatalog");
assert(has(catalogKf, "delete-keyframe"),  "delete-keyframe in aiToolCatalog");
assert(has(catalogKf, "clear-keyframes"),  "clear-keyframes in aiToolCatalog");
assert(has(catalogKf, '"Motion"'),         "Motion category in aiToolCatalog");

// ── [23] Phase 8 — QEP project file + IndexedDB + crash recovery ─────────────
console.log("\n[23] Phase 8 Project file / IndexedDB / crash recovery");

const qepTypes = read("lib/project/qepTypes.ts");
assert(qepTypes !== null, "lib/project/qepTypes.ts exists");
assert(has(qepTypes, "QepProject"),      "QepProject interface in qepTypes.ts");
assert(has(qepTypes, "QepClip"),         "QepClip interface in qepTypes.ts");
assert(has(qepTypes, "QEP_VERSION"),     "QEP_VERSION constant in qepTypes.ts");

const qepSer = read("lib/project/qepSerializer.ts");
assert(qepSer !== null, "lib/project/qepSerializer.ts exists");
assert(has(qepSer, "exportQep"),         "exportQep exported from qepSerializer.ts");
assert(has(qepSer, "importQep"),         "importQep exported from qepSerializer.ts");

const idbStore = read("lib/project/idbStorage.ts");
assert(idbStore !== null, "lib/project/idbStorage.ts exists");
assert(has(idbStore, "idbSave"),         "idbSave exported from idbStorage.ts");
assert(has(idbStore, "idbLoad"),         "idbLoad exported from idbStorage.ts");
assert(has(idbStore, "idbDelete"),       "idbDelete exported from idbStorage.ts");
assert(has(idbStore, "idbList"),         "idbList exported from idbStorage.ts");

const crashRec = read("lib/project/crashRecovery.ts");
assert(crashRec !== null, "lib/project/crashRecovery.ts exists");
assert(has(crashRec, "autosave"),        "autosave exported from crashRecovery.ts");
assert(has(crashRec, "recoverDraft"),    "recoverDraft exported from crashRecovery.ts");
assert(has(crashRec, "clearDraft"),      "clearDraft exported from crashRecovery.ts");

const pyModels23 = readRoot("fastapi/models/ai_editor.py");
assert(has(pyModels23, "SAVE_PROJECT"),  "SAVE_PROJECT in ai_editor.py");
assert(has(pyModels23, "LOAD_PROJECT"),  "LOAD_PROJECT in ai_editor.py");

assert(has(types, '"SAVE_PROJECT"'),     "SAVE_PROJECT in ai-editor.ts");
assert(has(types, '"LOAD_PROJECT"'),     "LOAD_PROJECT in ai-editor.ts");

const catalogPrj = read("lib/aiToolCatalog.ts");
assert(has(catalogPrj, "save-project"),  "save-project in aiToolCatalog");
assert(has(catalogPrj, "load-project"),  "load-project in aiToolCatalog");
assert(has(catalogPrj, '"Project"'),     "Project category in aiToolCatalog");

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Assertions: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nSome validation assertions FAILED. Fix the issues above.");
  process.exit(1);
} else {
  console.log("\nAll validation assertions passed. ✓");
}
