# Specification: Desktop Packaging Architecture & Embedded Runtime (EGM-SPEC-002)

**Status:** APPROVED FOR IMPLEMENTATION  
**Author:** QuickAI Studio Engineering Directorate (Elephant Session)  
**Target Subsystems:** `desktop/`, `build-studio-release.ps1`, `frontend/next.config.mjs`, `fastapi/`  
**Governing Standard:** Google Elephant-Goldfish Model (EGM)  
**Spec References:** EGM-SPEC-001 (Local Media Pipeline), Master Engineering Specification v1.0 Section 8.1  

---

## 1. Problem Statement & Motivation

QuickAI Studio currently features a local launcher (`start-studio.ps1`) and developer workflow, but the existing release packaging script (`build-studio-release.ps1`) delegates back to `start-studio.ps1` in the source repository. As established in the Release Readiness Audit, attempting to distribute this bundle to end-user workstations fails because:
1. **Host Dependency Leak**: The supervisor spawns `pnpm start` and looks for host venv Python, requiring a pre-existing Node/pnpm/Python developer setup.
2. **Missing Binary Bundling**: `ffmpeg.exe` and `ffprobe.exe` are assumed to exist in `C:\Users\DELL\bin` rather than bundled with the application.
3. **Storage Pollution**: Ingested media and SQLite state default to repository relative paths (`.quickai_studio/`) rather than the operating system user profile (`%APPDATA%\QuickAI Studio`).
4. **Packaging Isolation**: The installer package cannot run independently on a clean machine without developer tools.

EGM-SPEC-002 specifies the embedded runtime strategy and process isolation architecture for true zero-dependency desktop deployment.

---

## 2. Architectural Boundaries & Non-Goals

### 2.1 Goals
1. **Self-Contained Runtimes**: Package application with embedded Node runtime (via Electron), pre-compiled Next.js standalone server, embedded Python runtime, and bundled FFmpeg/FFprobe binaries.
2. **User Data Isolation**: Direct all persistent databases (`quickai_studio.db`), media assets (`storage/uploads`), and rendered exports (`storage/exports`) into `app.getPath("userData")` (`%APPDATA%\QuickAI Studio` on Windows; `~/Library/Application Support/QuickAI Studio` on macOS).
3. **Supervisor Robustness**: Electron supervisor handles child process spawning, port contention resolution, health check polling, and deterministic process tree termination on window close.
4. **Zero Cloud Requirement**: The desktop package functions completely offline with local deterministic intelligence, local SQLite persistence, and local FFmpeg processing.

### 2.2 Non-Goals
1. No cloud deployment or cloud database synchronization in the desktop packaging tier.
2. No modification to the EP-001 capability registry or core editing algorithms.
3. No bundling of proprietary DRM codecs or non-free FFmpeg libraries.

---

## 3. Packaging Architecture & Directory Layout

### 3.1 Packaged Bundle Directory Topology
```text
QuickAI-Studio/
├── QuickAI Studio.exe            # Electron main binary
├── resources/
│   ├── app.asar                  # Packaged Electron main.js + preload.js
│   ├── bin/                      # Bundled media binaries
│   │   ├── ffmpeg.exe            # Native FFmpeg
│   │   └── ffprobe.exe           # Native FFprobe
│   ├── python/                   # Embedded Python runtime
│   │   ├── python.exe
│   │   ├── Lib/
│   │   └── Scripts/
│   ├── fastapi/                  # Backend code & dependencies
│   │   ├── main.py
│   │   ├── routers/
│   │   ├── services/
│   │   └── models/
│   └── frontend/                 # Pre-compiled Next.js standalone bundle
│       ├── server.js             # Standalone HTTP entrypoint
│       ├── .next/
│       └── public/
```

### 3.2 Operating System User Profile Topology
When running packaged (`app.isPackaged === true`), all mutable state is strictly sandboxed inside:
```text
%APPDATA%\QuickAI Studio\ (Windows)
~/Library/Application Support/QuickAI Studio/ (macOS)
├── data/
│   └── quickai_studio.db         # SQLite persistent database
├── storage/
│   ├── uploads/                  # Ingested user media
│   └── exports/                  # Baked MP4 exports
└── logs/
    ├── backend.log               # FastAPI server logs
    └── supervisor.log            # Electron lifecycle logs
```

---

## 4. Supervisor Implementation Contract (`desktop/main.js`)

### 4.1 Environment Initialization
The Electron supervisor must construct the child environment dynamically:
```javascript
const userDataPath = app.getPath("userData");
const storageDir = path.join(userDataPath, "storage");
const dataDir = path.join(userDataPath, "data");
const logsDir = path.join(userDataPath, "logs");

// Ensure directories exist
[storageDir, dataDir, logsDir].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

const env = {
  ...process.env,
  LOCAL_FIRST_MODE: "1",
  LOCAL_FIRST_DEV_NO_AUTH: "1",
  MOCK_AI_MODE: "0",
  LOCAL_STUDIO_STORAGE_DIR: storageDir,
  LOCAL_STUDIO_DATA_DIR: dataDir,
  STUDIO_LOG_DIR: logsDir,
  NEXT_PUBLIC_LOCAL_FIRST_MODE: "1",
  NEXT_PUBLIC_STUDIO_PROJECT_KERNEL: "1",
  NEXT_PUBLIC_API_URL: `http://127.0.0.1:${BACKEND_PORT}`,
  NEXT_PUBLIC_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
  NEXTAUTH_SECRET: "quickai-studio-local-desktop-secret-key-32ch",
  NEXTAUTH_URL: `http://localhost:${FRONTEND_PORT}`,
  PORT: String(FRONTEND_PORT),
  PATH: [
    path.join(process.resourcesPath, "bin"),
    path.join(repoRoot, "bin"),
    process.env.PATH,
  ].filter(Boolean).join(process.platform === "win32" ? ";" : ":"),
};
```

### 4.2 Python Resolution Order
1. Embedded packaged Python: `process.resourcesPath/python/python.exe`
2. Repo virtualenv Python: `repoRoot/fastapi/venv/Scripts/python.exe`
3. Fallback system Python: `python.exe` / `python3`

### 4.3 Lifecycle & Teardown
1. On `before-quit` and `window-all-closed`:
   - Terminate `backendProc` using `taskkill /pid <PID> /T /F` (Windows) or `SIGTERM` followed by `SIGKILL` (Unix).
   - Terminate `frontendProc` synchronously.
   - Release all TCP port bindings before exiting the process.

---

## 5. Verification & Acceptance Criteria

| Check | Requirement | Verification Method |
|---|---|---|
| C1: Clean Machine Run | Package launches on machine without Node, pnpm, or Python in PATH | Isolated VM / clean user test |
| C2: Bundled Binaries | FFmpeg and FFprobe invoked exclusively from package resources | Process monitor inspection |
| C3: User Data Isolation | Zero write operations into `Program Files` or repo directory | Storage path assertion |
| C4: Port Agility | Fallback to available ports if 3000 or 8000 are occupied | Bind test |
| C5: Process Tree Reaping | No orphaned Python or Node processes on window close | `Get-Process python, node` |
