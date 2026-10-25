"use strict";

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = Number(process.env.QUICKAI_BACKEND_PORT || 8000);
const FRONTEND_PORT = Number(process.env.QUICKAI_FRONTEND_PORT || 3000);

let mainWindow = null;
let backendProc = null;
let frontendProc = null;
let isQuitting = false;

function resolveRepoRoot() {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, "..");
}

function buildStudioEnvironment(repoRoot) {
  const extraPaths = [
    path.join(repoRoot, "bin"),
    "C:\\Users\\DELL\\bin",
  ].filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  const sep = process.platform === "win32" ? ";" : ":";
  const pathEnv = [...extraPaths, process.env.PATH || process.env.Path || ""].join(sep);

  return {
    ...process.env,
    PATH: pathEnv,
    Path: pathEnv,
    LOCAL_FIRST_MODE: "1",
    MOCK_AI_MODE: "0",
    NEXT_PUBLIC_LOCAL_FIRST_MODE: "1",
    NEXT_PUBLIC_STUDIO_PROJECT_KERNEL: "1",
    NEXT_PUBLIC_API_URL: `http://${BACKEND_HOST}:${BACKEND_PORT}`,
    NEXT_PUBLIC_BACKEND_URL: `http://${BACKEND_HOST}:${BACKEND_PORT}`,
    NEXTAUTH_SECRET: "quickai-studio-local-dev-secret-key-32chars",
    NEXTAUTH_URL: `http://localhost:${FRONTEND_PORT}`,
    PORT: String(FRONTEND_PORT),
    EXPORT_SIGNING_SECRET:
      process.env.EXPORT_SIGNING_SECRET || "local-studio-export-signing-secret-dev-only",
    PORT: String(BACKEND_PORT),
  };
}

function resolvePythonExecutable(repoRoot) {
  const candidates =
    process.platform === "win32"
      ? [
          path.join(repoRoot, "fastapi", "venv", "Scripts", "python.exe"),
          "C:\\Users\\DELL\\.gemini\\antigravity\\scratch\\quickaishort\\fastapi\\venv\\Scripts\\python.exe",
          "python.exe",
        ]
      : [
          path.join(repoRoot, "fastapi", "venv", "bin", "python"),
          "python3",
          "python",
        ];

  for (const candidate of candidates) {
    if (!candidate.includes(path.sep) || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "python";
}

function waitForHttpReady(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
        } else if (Date.now() < deadline) {
          setTimeout(attempt, 350);
        } else {
          reject(new Error(`Service at ${url} returned HTTP ${res.statusCode}`));
        }
      });
      req.on("error", () => {
        if (Date.now() < deadline) {
          setTimeout(attempt, 350);
        } else {
          reject(new Error(`Timed out waiting for ${url}`));
        }
      });
      req.setTimeout(1500, () => req.destroy());
    };
    attempt();
  });
}

async function startBackend(repoRoot, env) {
  try {
    await waitForHttpReady(`http://${BACKEND_HOST}:${BACKEND_PORT}/health`, 1200);
    return; // Already running
  } catch {
    // Spawn local FastAPI daemon
  }

  const pyExe = resolvePythonExecutable(repoRoot);
  const fastapiDir = path.join(repoRoot, "fastapi");
  backendProc = spawn(
    pyExe,
    ["-m", "uvicorn", "main:app", "--host", BACKEND_HOST, "--port", String(BACKEND_PORT)],
    {
      cwd: fastapiDir,
      env,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await waitForHttpReady(`http://${BACKEND_HOST}:${BACKEND_PORT}/health`, 30000);
}

async function startFrontend(repoRoot, env) {
  try {
    await waitForHttpReady(`http://${BACKEND_HOST}:${FRONTEND_PORT}`, 1200);
    return; // Already running
  } catch {
    // Spawn Next.js frontend
  }

  const frontendDir = path.join(repoRoot, "frontend");
  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  frontendProc = spawn(pnpmCmd, ["start", "-p", String(FRONTEND_PORT)], {
    cwd: frontendDir,
    env: { ...env, PORT: String(FRONTEND_PORT) },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForHttpReady(`http://${BACKEND_HOST}:${FRONTEND_PORT}`, 30000);
}

function terminateChildren() {
  for (const proc of [frontendProc, backendProc]) {
    if (proc && !proc.killed) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(proc.pid), "/f", "/t"], { windowsHide: true });
        } else {
          proc.kill("SIGTERM");
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }
  frontendProc = null;
  backendProc = null;
}

async function createStudioWindow() {
  const repoRoot = resolveRepoRoot();
  const env = buildStudioEnvironment(repoRoot);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: "QuickAI Studio",
    backgroundColor: "#060609",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  try {
    await startBackend(repoRoot, env);
    await startFrontend(repoRoot, env);
    await mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}/editor`);
    mainWindow.show();
  } catch (err) {
    dialog.showErrorBox(
      "QuickAI Studio Startup Error",
      `Could not start local Studio services:\n${err instanceof Error ? err.message : String(err)}`,
    );
    app.quit();
  }
}

app.whenReady().then(createStudioWindow);

app.on("before-quit", () => {
  isQuitting = true;
  terminateChildren();
});

app.on("window-all-closed", () => {
  terminateChildren();
  if (process.platform !== "darwin" || isQuitting) {
    app.quit();
  }
});
