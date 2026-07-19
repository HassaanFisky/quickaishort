# 10 — Infrastructure

## GCP project (from project memory + code defaults)

| Item | Value | Evidence |
|------|-------|----------|
| Project | `quickaishort-agent-494304` | CLAUDE.md, `db.py` defaults |
| Number | `99900313102` | CLAUDE.md |
| Media bucket | `quickaishort-agent-494304-media` | CLAUDE.md / db defaults |
| API service | `quickai-api` Cloud Run | PRODUCTION_STATUS / CLAUDE |
| Worker service | `quickai-worker` | same |
| Frontend | Vercel → `quickaishort.online` | README |

**Live URL health at audit time:** Insufficient evidence (not re-probed in this session). Use `GET /health` before claiming uptime.

---

## Data stores

See Backend storage matrix. Operationally:

- **Firestore** = product DB for users/credits/projects/analytics  
- **GCS** = blobs  
- **Redis** = ephemeral jobs/cache  
- **Mongo** = legacy GridFS + some history (verify each collection before deletion)

---

## Deploy artifacts

| Artifact | Path |
|----------|------|
| API Dockerfile | `fastapi/Dockerfile` |
| Worker Dockerfile | `fastapi/Dockerfile.worker` |
| Cloud Build | `cloudbuild.yaml` |
| Deploy scripts | `deploy_production.ps1`, `deploy_production.sh`, `deploy.sh` |
| Worker YAML | `fastapi/cloud-run-worker.yaml` |
| Env templates | `fastapi/env.yaml`, `env-worker.yaml`, `.env.example` |
| Alerts | `fastapi/alerts.yaml` |
| Setup | `setup_infrastructure.sh` |

**Machine note (CLAUDE):** Local gcloud may need `CLOUDSDK_CONFIG=E:\gcloud-config`, `TMP=E:\gcloud-temp` if C: full.

---

## CI/CD

| Workflow | Path | Does |
|----------|------|------|
| Linter | `.github/workflows/linter.yml` | Black/flake8 on `fastapi/`; ESLint on frontend via npm |
| Deploy video pipeline | `.github/workflows/deploy-video-pipeline.yml` | Pipeline deploy |

README badges reference `ci.yml` — **verify whether `ci.yml` exists**; audit found `linter.yml` + `deploy-video-pipeline.yml`. Possible badge drift.

Frontend CI uses `npm install --legacy-peer-deps` while local docs prefer `pnpm` — dual package manager drift.

---

## Realtime

- Pusher channels: `user-dashboard-{user_id}`, `export-{job_id}` (`services/realtime.py`)  
- WebSocket: `/ws/stats/{user_id}`  

---

## Extension

`extension/` — Chrome content script injects QuickAI button on YouTube → `/editor?v=`.

---

## Scalability notes

- Worker concurrency historically set low (concurrency=1) for ffmpeg safety.  
- Chunked acquisition for long clips.  
- Startup probe tuned for heavy imports (ADK/genai).  

**Insufficient evidence** for current Cloud Run min/max instances without live `gcloud` query.
