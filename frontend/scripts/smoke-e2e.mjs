#!/usr/bin/env node
/**
 * End-to-end smoke test — Pillar-2 backend contract.
 *
 * 1. Spawns FastAPI on port 8001 with MOCK_AI_EDITOR=true AUTH_DISABLED=true
 * 2. Polls GET /health until 200 (max 30 s)
 * 3. POSTs a valid AIEditorRequest to /api/ai-edit
 * 4. Asserts response shape and content
 * 5. Kills server; exits 0 on success, 1 on failure
 *
 * Run: node scripts/smoke-e2e.mjs
 * Requires: python (venv/Scripts/python.exe) + fastapi deps installed
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // frontend/
const FASTAPI_DIR = path.resolve(ROOT, "..", "fastapi");
const PORT = 8001;
const BASE = `http://127.0.0.1:${PORT}`;

let server = null;
let exitCode = 0;

function log(msg) { console.log(`[smoke-e2e] ${msg}`); }
function err(msg) { console.error(`[smoke-e2e] ✗ ${msg}`); exitCode = 1; }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForHealth(maxMs = 30_000) {
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
  // Try venv python first, fall back to system python
  const pythonPaths = [
    path.join(FASTAPI_DIR, "venv", "Scripts", "python.exe"),
    path.join(FASTAPI_DIR, "venv", "bin", "python"),
    "python",
  ];
  const python = pythonPaths[0]; // Windows-first

  const proc = spawn(
    python,
    ["-m", "uvicorn", "main:app", "--port", String(PORT), "--host", "127.0.0.1"],
    {
      cwd: FASTAPI_DIR,
      env: {
        ...process.env,
        MOCK_AI_EDITOR: "true",
        AUTH_DISABLED: "true",
        NEXTAUTH_SECRET: "smoke-test-secret",
        PYTHONPATH: FASTAPI_DIR,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  proc.stdout.on("data", (d) => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`  [fastapi] ${line}\n`);
  });
  proc.stderr.on("data", (d) => {
    const line = d.toString().trim();
    if (line) process.stderr.write(`  [fastapi-err] ${line}\n`);
  });

  return proc;
}

// ── Main ─────────────────────────────────────────────────────────────────────
try {
  log(`Starting FastAPI on port ${PORT}…`);
  server = spawnServer();

  log("Waiting for /health…");
  const healthy = await waitForHealth(60_000);
  if (!healthy) {
    err("Server did not become healthy within 30 s");
    process.exit(1);
  }
  log("/health → 200 ✓");

  // ── POST /api/ai-edit ────────────────────────────────────────────────────
  const body = {
    prompt: "trim to the hook and add a CTA",
    current_state: {
      videoDuration: 60.0,
      currentTime: 0.0,
      elementCount: 0,
      captionCount: 0,
      captionsEnabled: true,
      aspectRatio: "9:16",
      visualFilter: "None",
      audioBoost: 100,
      playbackSpeed: 100,
    },
    transcript: [],
  };

  log("POSTing to /api/ai-edit…");
  let resp;
  try {
    resp = await fetch(`${BASE}/api/ai-edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (fetchErr) {
    err(`fetch threw: ${fetchErr.message}`);
    process.exit(1);
  }

  if (resp.status !== 200) {
    const text = await resp.text().catch(() => "(no body)");
    err(`Expected 200, got ${resp.status}: ${text}`);
    process.exit(1);
  }

  const data = await resp.json();

  // Assertions
  function assert(cond, label) {
    if (cond) {
      log(`  ✓ ${label}`);
    } else {
      err(`  assertion failed: ${label}`);
    }
  }

  assert(resp.status === 200, "response.status === 200");
  assert(Array.isArray(data.actions), "body.actions is an array");
  assert(data.actions.length === 4, `body.actions.length === 4 (got ${data.actions.length})`);
  assert(data.used_mock === true, "body.used_mock === true");
  assert(data.actions[0]?.type === "TRIM", `body.actions[0].type === "TRIM" (got ${data.actions[0]?.type})`);
  assert(typeof data.message === "string", "body.message is a string");
  assert(Array.isArray(data.suggestions), "body.suggestions is an array");

  if (exitCode === 0) {
    log("All smoke assertions passed. ✓");
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
