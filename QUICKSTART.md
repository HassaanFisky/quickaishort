# QuickAI Short — Developer Quickstart

Spin up a local environment for **QuickAI Short** (production product). Studio Kernel APIs live in the same backend under feature flags.

For architecture truth: [`docs/studio/README.md`](docs/studio/README.md).

---

## Prerequisites

- Node.js 20.x (LTS) + **pnpm**
- Python 3.12 (project standard)
- Redis (RQ render queue)
- MongoDB (Atlas or local)
- GCS credentials / ADC for media paths (production uses bucket `quickaishort-agent-494304-media`)
- `GEMINI_API_KEY` for AI editor and agents

---

## Clone

```bash
git clone https://github.com/HassaanFisky/quickaishort.git
cd quickaishort
```

---

## Environment

Copy examples and fill secrets (never commit them):

- `frontend/.env.local` ← from `frontend/.env.example`
- `fastapi/.env` ← from `fastapi/.env.example`

Minimum useful set:

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_API_URL` | frontend | FastAPI base URL |
| `NEXTAUTH_SECRET` | both (must match) | JWT auth |
| `GEMINI_API_KEY` | fastapi | AI editor + agents |
| `REDIS_URL` | fastapi | RQ |
| `MONGODB_URI` / `MONGO_URI` | fastapi | DB (use names from `.env.example`) |
| `GOOGLE_CLOUD_PROJECT` | fastapi | `quickaishort-agent-494304` |
| `GCS_BUCKET_NAME` | fastapi | `quickaishort-agent-494304-media` |

Optional Studio Kernel: `STUDIO_PROJECT_KERNEL=1`, `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1`.

---

## Run

### Backend

```bash
cd fastapi
python -m venv venv
# Windows: .\venv\Scripts\activate
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Worker (separate terminal):

```bash
python render_worker.py
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

- App: http://localhost:3000  
- API docs: http://localhost:8000/docs  
- Health: http://localhost:8000/health  

---

## Optional local infra

```bash
docker run --name quickai-redis -d -p 6379:6379 redis:alpine
docker run --name quickai-mongo -d -p 27017:27017 mongo:latest
```

---

## Smoke checks

```bash
curl -s http://localhost:8000/health
cd frontend && npx tsc --noEmit
```

Protected AI / Pre-Flight routes require a valid NextAuth session JWT — do not expect unauthenticated full pipeline success.

---

## Layout

```text
quickaishort/
├── frontend/          # Next.js 14.2.35 editor + dashboard
├── fastapi/           # API, agents, Studio Kernel, render_worker
├── docs/studio/       # Canonical architecture + ADRs + EPs
├── extension/         # Chrome MV3 YouTube helper
└── ARCHITECTURE.md
```

**Storage:** GCS is primary for `/adk` + `/editor` media. MongoDB GridFS is legacy `/api/v1/video/*` only.

**ADK UI (`/adk`):** Coming Soon in product — not a local “live wizard” surface.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Redis connection errors | Start Redis / fix `REDIS_URL` |
| Gemini 401/429 | Valid key + prepaid credits |
| GCS 403 | ADC / billing / bucket IAM |
| Auth failures | Matching `NEXTAUTH_SECRET` on FE + BE |

More: [`docs/studio/25-troubleshooting.md`](docs/studio/25-troubleshooting.md) · [`SECURITY.md`](SECURITY.md)
