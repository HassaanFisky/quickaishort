#!/usr/bin/env node
/**
 * Zero-cost P0 golden-path behavioural checks.
 * Compiles production TS with esbuild, then proves AI apply/undo/redo,
 * honest feedback, trim export range, and caption burn-in.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputs = [];

function compile(input, name, bundle = false) {
  const output = path.join(tmpdir(), `${name}_${Date.now()}_${outputs.length}.mjs`);
  const args = [
    "--yes",
    "esbuild",
    path.join(root, input),
    "--format=esm",
    "--platform=node",
    `--outfile=${output}`,
  ];
  if (bundle) args.push("--bundle", "--alias:@=./src");
  execFileSync("npx", args, { cwd: root, stdio: "pipe" });
  outputs.push(output);
  return import(pathToFileURL(output).href);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

try {
  const honesty = await compile("src/lib/aiCommandHonesty.ts", "p0_honesty");
  const storeModule = await compile("src/stores/editorStore.ts", "p0_store", true);
  const compositor = await compile(
    "src/lib/export/frameCompositor.ts",
    "p0_compositor",
    true,
  );

  const emptyFeedback = honesty.formatCommandFeedback({
    appliedTypes: [],
    message: "Done.",
    dropped: ["malformed:TRIM"],
    status: "no_op",
  });
  assert(
    emptyFeedback.includes("No edits applied") &&
      emptyFeedback.includes("malformed:TRIM") &&
      emptyFeedback !== "Done.",
    "empty/dropped plans produce honest feedback",
  );

  assert(
    honesty.shouldSkipCreditGate(true) && !honesty.shouldSkipCreditGate(false),
    "MOCK_AI_MODE alone bypasses the client credit gate",
  );

  const store = storeModule.useEditorStore;
  store.setState({
    duration: 60,
    captions: [],
    markIn: null,
    markOut: null,
    trimMarker: null,
    suggestions: [],
    silenceSegments: [],
    aiUndoStack: [],
    aiRedoStack: [],
  });
  store.getState().applyAiEdits([
    { type: "TRIM", start: 2, end: 15 },
    {
      type: "ADD_CAPTION",
      text: "Visible hook",
      startTime: 2,
      endTime: 5,
    },
  ]);

  let state = store.getState();
  assert(
    state.markIn === 2 &&
      state.markOut === 15 &&
      state.trimMarker?.startTime === 2 &&
      state.trimMarker?.endTime === 15,
    "TRIM mutates the visible preview/export range",
  );
  assert(
    state.captions.length === 1 && state.captions[0].text === "Visible hook",
    "ADD_CAPTION mutates editor caption state",
  );
  assert(state.aiUndoStack.length === 1, "AI edit creates one undo snapshot");

  const range = honesty.resolveExportRange({
    markIn: state.markIn,
    markOut: state.markOut,
    trimMarker: state.trimMarker,
    selectedClip: null,
    duration: state.duration,
  });
  assert(
    range.start === 2 && range.end === 15 && range.source === "marks",
    "client export resolves the AI TRIM range",
  );

  assert(state.undoAiEdit(), "AI undo succeeds");
  state = store.getState();
  assert(
    state.markIn === null &&
      state.markOut === null &&
      state.trimMarker === null &&
      state.captions.length === 0,
    "AI undo restores trim and caption state",
  );

  assert(state.redoAiEdit(), "AI redo succeeds");
  state = store.getState();
  assert(
    state.markIn === 2 && state.markOut === 15 && state.captions.length === 1,
    "AI redo restores trim and caption state",
  );

  const drawnText = [];
  const ctx = {
    filter: "none",
    globalAlpha: 1,
    font: "",
    textAlign: "center",
    textBaseline: "middle",
    fillStyle: "",
    drawImage() {},
    measureText(text) {
      return { width: text.length * 10 };
    },
    fillRect() {},
    fillText(text) {
      drawnText.push(text);
    },
  };
  compositor.applyFrameComposite(ctx, {}, 720, 1280, {
    filter: {
      brightness: 1,
      contrast: 1,
      saturation: 1,
      hue: 0,
      opacity: 1,
    },
    captions: state.captions,
    currentTimeSec: 3,
  });
  assert(
    drawnText.includes("Visible hook"),
    "ADD_CAPTION is burned into an exported frame",
  );

  const exporterSource = readFileSync(
    path.join(root, "src/lib/export/webCodecsExporter.ts"),
    "utf8",
  );
  assert(
    exporterSource.includes("width: 720") &&
      exporterSource.includes("height: 1280") &&
      exporterSource.includes("width: 1080") &&
      exporterSource.includes("height: 1920"),
    "client export keeps both reliable 9:16 presets",
  );

  console.log("\nP0 golden-path checks passed.");
} finally {
  for (const output of outputs) {
    try {
      unlinkSync(output);
    } catch {
      // Best-effort temporary-file cleanup.
    }
  }
}
