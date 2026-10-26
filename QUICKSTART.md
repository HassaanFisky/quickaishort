# QuickAI Studio — Developer Quickstart

Spin up a local development environment for **QuickAI Studio** (`frontend/` Next.js 14 + `fastapi/` Python backend).

For canonical architecture truth: [`docs/studio/README.md`](docs/studio/README.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Two Ways to Run Locally

1. **Local-First Zero-Daemon Mode (`LOCAL_FIRST_MODE=1`)** — Runs with embedded SQLite (`.quickai_studio/data/quickai_studio.db`), local filesystem storage (`.quickai_studio/storage/`), in-memory job coordination, and zero-spend deterministic/mock AI (`MOCK_AI_MODE=1`) or local Ollama. Requires **no Docker, no Redis, no MongoDB, and no cloud credentials**.
2. **Full Cloud-Mirror Mode** — Connects to local or cloud Redis, MongoDB, Google Cloud Storage (ADC), and live Google Gemini API keys.

---

## Prerequisites

- **Node.js** 20+ (LTS) or 22+ and **pnpm**
- **Python** 3.11+ or 3.12
- **FFmpeg / FFprobe** on `PATH` (for server/local media probing and encoding; install on Windows via `winget install Gyan.FFmpeg`)
- *(Cloud-Mirror Mode only)* Redis (`6379`), MongoDB (`27017`), GCP Application Default Credentials, and `GEMINI_API_KEY`

---

## 1. Clone & Install

```bash
git clone https://github.com/HassaanFisky/quickaishort.git
cd quickaishort

# Install frontend dependencies
cd frontend
pnpm install

# Create backend virtual environment & install dependencies
cd ../fastapi
python -m venv venv
# Windows PowerShell: .\venv\Scripts\Activate.ps1
# macOS / Linux:      source venv/bin/activate
pip install -r requirements.txt
```

---

## 2. Environment Configuration

Copy the example templates (never commit `.env` or `.env.local`):

```bash
cp frontend/.env.example frontend/.env.local
cp fastapi/.env.example fastapi/.env
```

### Key Environment Variables

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Frontend | Yes | FastAPI base URL (`http://127.0.0.1:8000`) |
| `NEXTAUTH_SECRET` | Both | Yes | Shared HS256 JWT signing secret (**must be identical** in both `.env` files) |
| `NEXTAUTH_URL` | Frontend | Yes | Canonical frontend URL (`http://localhost:3000` locally) |
| `LOCAL_FIRST_MODE` | Both | Optional | Set to `1` for SQLite + local disk storage without Redis/Mongo/GCS |
| `LOCAL_FIRST_DEV_NO_AUTH` | Frontend | Optional | Set to `1` (development only) to bypass `/signin` redirect in local-first mode |
| `MOCK_AI_MODE` | FastAPI | Optional | Set to `1` (or `true` with `ENVIRONMENT=staging`) for zero-spend schema-valid AI fixtures |
| `GEMINI_API_KEY` | FastAPI | Cloud AI | Google Gemini API key for live conversational editing and ADK agents |
| `REDIS_URL` | FastAPI | Cloud/Queue | Redis connection URL (`redis://localhost:6379`) |
| `MONGODB_URI` | Both | Cloud/Auth | MongoDB connection string for NextAuth users, projects, and export records |
| `GOOGLE_CLOUD_PROJECT` | FastAPI | Cloud | GCP project ID (`quickaishort-agent-494304`) |
| `GCS_BUCKET_NAME` | FastAPI | Cloud | GCS media bucket (`quickaishort-agent-494304-media`) |
| `STUDIO_PROJECT_KERNEL` | FastAPI | Optional | Set to `1` to enable Studio Kernel persistence routes |
| `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL` | Frontend | Optional | Set to `1` to enable client-side Studio Kernel dual-run sync |
| `MEDIA_PROXY_AUTH_REQUIRED` | FastAPI | Security | Defaults to `true` (enforces JWT auth on `/api/proxy-media`) |
| `TRUST_PROXY_HEADERS` | FastAPI | Security | Set to `true` only behind a trusted reverse proxy (Cloud Run / Vercel) |

---

## 3. Run the Platform

### Option A: 1-Click Local-First Launcher (Windows PowerShell)

```powershell
.\start-studio.ps1
```

### Option B: Manual Two-Terminal Startup (Local-First + Mock AI)

**Terminal 1 — FastAPI Backend:**

```powershell
cd fastapi
.\venv\Scripts\Activate.ps1
$env:LOCAL_FIRST_MODE = "1"
$env:MOCK_AI_MODE = "1"
$env:ENVIRONMENT = "staging"
$env:NEXTAUTH_SECRET = "quickai-studio-local-dev-secret-key-32chars"
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Next.js Frontend:**

```powershell
cd frontend
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8000"
$env:NEXT_PUBLIC_LOCAL_FIRST_MODE = "1"
$env:LOCAL_FIRST_DEV_NO_AUTH = "1"
$env:NEXTAUTH_SECRET = "quickai-studio-local-dev-secret-key-32chars"
$env:NEXTAUTH_URL = "http://localhost:3000"
pnpm dev
```

- **Studio UI:** http://localhost:3000  
- **Editor:** http://localhost:3000/editor  
- **OpenAPI Docs:** http://127.0.0.1:8000/docs  
- **Health Check:** http://127.0.0.1:8000/health  

---

## 4. Verification & Testing

```bash
# Frontend lint, typecheck, verification scripts, and production build
cd frontend
pnpm lint
npx tsc --noEmit
node scripts/verify_middleware.mjs
node scripts/verify_navbar_focus.mjs
pnpm build

# Backend pytest suite & EP-001 registry sync check
cd ../fastapi
python scripts/check_registry_sync.py
python -m pytest
```

---

## Troubleshooting

| Symptom | Resolution |
|---------|------------|
| `401 Unauthorized` on API calls | Ensure `NEXTAUTH_SECRET` is identical in `frontend/.env.local` and `fastapi/.env`. |
| `ffprobe` / `ffmpeg` not found on local media upload | Install FFmpeg and ensure `ffmpeg` and `ffprobe` are on your system `PATH`. |
| `/health` shows `mongo: false, gcs: false` in Cloud mode | Expected locally when GCP ADC credentials are not configured (`LOCAL_FIRST_MODE=1` uses local SQLite + disk instead). |
| `CORS` blocked on `http://127.0.0.1:3000` | Both `http://localhost:3000` and `http://127.0.0.1:3000` are allowed in `fastapi/main.py`. |

More details: [`docs/studio/25-troubleshooting.md`](docs/studio/25-troubleshooting.md) · [`SECURITY.md`](SECURITY.md)
