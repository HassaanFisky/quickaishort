#!/usr/bin/env node
/**
 * OPTIONAL real-Gemini smoke harness — costs Gemini quota, never runs in CI.
 *
 * Usage (operator only):
 *   cd frontend
 *   GEMINI_API_KEY=$YOUR_KEY node scripts/smoke-e2e-real.mjs
 *
 * Spawns FastAPI on port 8002 with MOCK_AI_EDITOR=false, sends a real prompt,
 * and asserts structural invariants on the response (action types, timestamp
 * bounds, etc.). Does NOT assert exact action counts/types — Gemini is
 * non-deterministic.
 *
 * Exit 0 on success OR when GEMINI_API_KEY is absent (opt-in guard).
 * Exit 1 only on assertion failure.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FASTAPI_DIR = path.resolve(ROOT, "..", "fastapi");
const PORT = 8002;
const BASE = `http://127.0.0.1:${PORT}`;

// ── Opt-in guard ─────────────────────────────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
  console.log(
    "GEMINI_API_KEY missing — refusing to run (this harness costs Gemini quota).",
  );
  process.exit(0);
}

const KNOWN_ACTION_TYPES = new Set([
  "ADD_CAPTION", "REMOVE_CAPTION", "UPDATE_CAPTION",
  "TRIM", "SPLIT_CLIP", "DELETE_CLIP", "SELECT_CLIP",
  "ADD_FILTER", "RESET_FILTER", "SET_VISUAL_FILTER",
  "SET_AUDIO_BOOST", "SET_NOISE_REDUCTION", "SET_PLAYBACK_SPEED",
  "TOGGLE_CAPTIONS", "TOGGLE_TRANSITIONS", "TOGGLE_VOICEOVER",
  "SEEK", "PLAY", "PAUSE", "EXPORT_CLIP",
  "ADD_ELEMENT", "UPDATE_ELEMENT", "REMOVE_ELEMENT",
  "DETECT_VIRAL_MOMENTS", "GENERATE_HOOK_CAPTION", "SUGGEST_STYLE_PRESET", "EXPLAIN_LAST_EDIT",
]);

const VIDEO_DURATION = 30.0;

let server = null;
let exitCode = 0;

function log(msg) { console.log(`[smoke-real] ${msg}`); }
function err(msg) { console.error(`[smoke-real] ✗ ${msg}`); exitCode = 1; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function assert(cond, label) {
  if (cond) { log(`  ✓ ${label}`); } else { err(`  assertion failed: ${label}`); }
}

async function waitForHealth(maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.status === 200) return true;
    } catch { /* not ready yet */ }
    await sleep(500);
  }
  return false;
}

function spawnServer() {
  const python = path.join(FASTAPI_DIR, "venv", "Scripts", "python.exe");
  return spawn(
    python,
    ["-m", "uvicorn", "main:app", "--port", String(PORT), "--host", "127.0.0.1"],
    {
      cwd: FASTAPI_DIR,
      env: {
        ...process.env,
        MOCK_AI_EDITOR: "false",
        AUTH_DISABLED: "true",
        NEXTAUTH_SECRET: "real-smoke-secret",
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        PYTHONPATH: FASTAPI_DIR,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
try {
  log(`Starting FastAPI on port ${PORT} (MOCK_AI_EDITOR=false)…`);
  server = spawnServer();

  server.stdout.on("data", (d) => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`  [fastapi] ${line}\n`);
  });
  server.stderr.on("data", (d) => {
    const line = d.toString().trim();
    if (line) process.stderr.write(`  [fastapi-err] ${line}\n`);
  });

  log("Waiting for /health (up to 60s for ADK imports)…");
  const healthy = await waitForHealth(60_000);
  if (!healthy) {
    err("Server did not become healthy within 60 s");
    process.exit(1);
  }
  log("/health → 200 ✓");

  // ── POST /api/ai-edit with real prompt ──────────────────────────────────
  const body = {
    prompt:
      "Trim to the most exciting moment and add an emoji sticker in the bottom-right corner",
    current_state: {
      videoDuration: VIDEO_DURATION,
      currentTime: 0.0,
      elementCount: 0,
      captionCount: 0,
      captionsEnabled: true,
      aspectRatio: "9:16",
      visualFilter: "None",
      audioBoost: 100,
      playbackSpeed: 100,
    },
    transcript: [
      { text: "Welcome to the show", start: 0, end: 2.5 },
      { text: "Today's biggest moment is right here", start: 2.5, end: 6.0 },
      { text: "And the winner is announced now", start: 6.0, end: 9.5 },
    ],
  };

  log("POSTing real prompt to /api/ai-edit…");
  let resp;
  try {
    resp = await fetch(`${BASE}/api/ai-edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (fetchErr) {
    err(`fetch threw: ${fetchErr.message}`);
    process.exit(1);
  }

  const data = await resp.json().catch(() => null);
  if (!data) {
    err("Response body was not valid JSON");
    process.exit(1);
  }

  log(`HTTP ${resp.status} — status="${data.status}" model="${data.model}" actions=${data.actions?.length}`);

  // ── Structural invariant assertions ─────────────────────────────────────
  assert(resp.status === 200, `HTTP 200 (got ${resp.status})`);
  assert(Array.isArray(data.actions), "body.actions is an array");
  assert(data.used_mock === false, "body.used_mock === false");
  assert(
    ["ok", "clarification_needed", "no_op"].includes(data.status),
    `body.status is one of ok/clarification_needed/no_op (got "${data.status}")`,
  );
  assert(
    typeof data.model === "string" && data.model.startsWith("gemini"),
    `body.model starts with "gemini" (got "${data.model}")`,
  );
  assert(Array.isArray(data.clamped), "body.clamped is an array");
  assert(Array.isArray(data.dropped), "body.dropped is an array");

  // Per-action structural checks
  let actionsClean = true;
  for (const [i, action] of (data.actions ?? []).entries()) {
    if (!KNOWN_ACTION_TYPES.has(action.type)) {
      err(`actions[${i}].type "${action.type}" is not in the 23 known types`);
      actionsClean = false;
    }
    // Timestamp bounds: any float field named startTime/endTime/time/start/end
    for (const field of ["startTime", "endTime", "time", "start", "end"]) {
      if (field in action) {
        const v = action[field];
        if (typeof v !== "number" || v < 0 || v > VIDEO_DURATION) {
          err(
            `actions[${i}].${field}=${v} out of [0, ${VIDEO_DURATION}]`,
          );
          actionsClean = false;
        }
      }
    }
    // Position bounds for ADD_ELEMENT / UPDATE_ELEMENT
    if (action.type === "ADD_ELEMENT" && action.element) {
      const el = action.element;
      if ("x" in el && (el.x < 0 || el.x > 1080)) {
        err(`actions[${i}].element.x=${el.x} out of [0, 1080]`);
        actionsClean = false;
      }
      if ("y" in el && (el.y < 0 || el.y > 1920)) {
        err(`actions[${i}].element.y=${el.y} out of [0, 1920]`);
        actionsClean = false;
      }
    }
  }
  if (actionsClean) log("  ✓ all action types are in the 23 known types and timestamps/positions are in-bounds");

  if (exitCode === 0) {
    log("All real-Gemini smoke assertions passed. ✓");
  }
} finally {
  if (server) {
    log("Killing server…");
    server.kill("SIGTERM");
    await sleep(500);
    if (!server.killed) server.kill("SIGKILL");
  }
  process.exit(exitCode);
}
