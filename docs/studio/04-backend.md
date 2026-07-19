# 04 — Backend

**Root:** `fastapi/`  
**Process entry:** `main.py`  
**Worker entry:** `render_worker.py`

---

## Runtime shape

- FastAPI app with `lifespan`: `init_db()`, deferred `run_startup_checks()`, Redis pubsub listener, `close_db()` on shutdown (`main.py`).
- Env validation warns on missing `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT`, `REDIS_URL`, `NEXTAUTH_SECRET`, `EXPORT_SIGNING_SECRET`, `PUBLIC_API_URL`.
- Rate limiting via `slowapi`.

---

## Auth (verified)

| Mechanism | File | Notes |
|-----------|------|-------|
| User JWT | `services/auth.py` `get_verified_user_id` | NextAuth HS256, `NEXTAUTH_SECRET`, claim `sub`/`id` |
| Admin | `X-Admin-Secret` vs `ADMIN_SECRET` | DLQ, cookies, analytics, email |
| Download signing | `services/signing.py` | `/api/download/{job_id}` |
| `AUTH_DISABLED` | `.env.example` documents it | **Not implemented** in `auth.py` (grep empty) |
| `firebase_auth.py` | Documented in CLAUDE.md | **File does not exist** |

### Auth gaps

- `POST /api/pipeline/run` — no `Depends(get_verified_user_id)` (`routers/pipeline_router.py`).
- Some public/stock/health routes intentionally open — verify before expanding.

---

## AI Editor API

| Method | Path | Handler | File |
|--------|------|---------|------|
| POST | `/api/ai-edit` | `ai_edit` | `routers/ai_editor_router.py` |
| POST | `/api/ai-editor/command` | `handle_editor_command` | same |
| POST | `/api/ai-editor/command/stream` | SSE stream | same |
| GET | `/api/ai-editor/health` | health | same |

**Engine:** `services/ai_editor_engine.py`  
**Models:** `models/ai_editor.py` (large action union)  
**Sanitiser:** `services/ai_editor_sanitiser.py`  
**Credits:** `deduct_credits(user_id, 1)` — 402 on failure  

**Critical fact:** Engine returns **JSON actions**. It does **not** mutate a server timeline. Execution is client-side via `applyAiEdits`.

---

## Agent / ADK endpoints (selected)

| Path | Role |
|------|------|
| POST `/api/preflight` | ADK Pre-Flight (`main.py`) |
| POST `/api/v1/preflight/predict` | Alternate preflight router |
| POST `/api/analyze` | Analysis |
| POST `/api/direct` | Director |
| POST `/api/adk/upload\|enhance\|generate` | ADK Studio |
| GET `/api/adk/stock` | Pexels stock |
| GET `/api/agent-runtime/health` | Agent readiness |
| GET `/api/agent-trace/{session_id}` | Trace |

---

## Render / queue endpoints (selected)

| Path | Role |
|------|------|
| POST `/api/process-video`, `/api/create-video` | Enqueue export |
| GET `/api/status/{job_id}`, `/api/render/status/{job_id}` | Status |
| DELETE `/api/render/{job_id}` | Cancel |
| GET `/api/render/dead`, POST `/api/render/retry/{job_id}` | DLQ |
| GET `/api/render/dlq/stats` | DLQ stats |
| GET `/api/download/{job_id}` | Signed download |
| POST `/api/pipeline/run` | Viral→render one-click (**auth gap**) |

---

## Storage matrix

| Store | Use | Evidence |
|-------|-----|----------|
| GCS | Primary uploads/exports/ADK | `services/db.py`, `storage_service.py` |
| Firestore | Stats, projects, pipeline_runs, analytics, ADK sessions | `stats_service`, `pipeline_monitor`, session services |
| Mongo GridFS | Legacy `/api/v1/video/*` | `services/storage.py`, `routers/video.py` |
| Redis | RQ, streams, caches, pipeline keys | `queue_service`, `render_queue`, `video_acquisition` |

**Drift:** Some responses still emit `gridfs://` while writing GCS (`youtube.py`, `tts_service` comments) — treat as bug.

---

## Headless NLE assessment

### Exists

- Export trim/filters/captions/overlays/speed via `RenderService` / `ExportRequest`
- `RenderManifest` + `compile_manifest_to_ffmpeg` (partial worker consumption)
- Rich AI action **schemas**
- B-roll search endpoint

### Does not exist as server-executable NLE

- Authoritative multi-track timeline database API
- Server apply of ripple/rolling/slip/slide
- Full keyframe bake path as primary export
- Unified tool runtime with dependency graph + cost accounting

---

## Dependencies (pinned samples from `requirements.txt`)

fastapi 0.136.3 · google-adk[bigquery] ≥2.1.0 · google-genai ≥1.14.0 · redis 5.0.4 · rq 1.16.2 · celery 5.4.0 · motor 3.5.0 · ffmpeg-python 0.2.0 · tenacity 9.1.4 · sentry-sdk · PyJWT 2.13.0

---

## Backend evolution rules

1. Do not delete GridFS path until zero traffic confirmed.  
2. Every new edit capability = Tool definition + sanitiser + FE applicator + optional server bake.  
3. Prefer extending `ai_editor` models over new ad-hoc JSON.  
4. Close pipeline auth before public marketing of `/api/pipeline/run`.
