# AGENTS.md

QuickAI Short — Next.js 14 frontend (`frontend/`) + FastAPI backend (`fastapi/`). See
`QUICKSTART.md`, `CLAUDE.md`, and `docs/studio/README.md` for product/architecture truth
and the canonical lint/test/build/run commands. This file only adds durable, non-obvious
operating notes for automated agents.

## Cursor Cloud specific instructions

### Services (dev) and where the standard commands live
- Frontend (`frontend/`, pnpm): `pnpm dev` (http://localhost:3000), `pnpm lint`, `npx tsc --noEmit`, `pnpm build`. No frontend test runner exists.
- Backend API (`fastapi/`, venv at `fastapi/venv`): `./venv/bin/uvicorn main:app --port 8000` (health `GET /health`, docs `/docs`).
- Render worker (`fastapi/`, optional — only for actual server-side exports): `render_worker.py` (see worker caveat below).
- Backend tests: `./venv/bin/python -m pytest` from `fastapi/`.

### Local infra must be started each session (installed in the VM, not auto-started)
Redis and MongoDB 8 are installed in the VM image (persist in the snapshot) but do NOT auto-start:
- Redis: `sudo redis-server --daemonize yes --port 6379`
- MongoDB: `sudo mongod --dbpath /var/lib/mongodb --logpath /var/log/mongodb/mongod.log --bind_ip 127.0.0.1 --fork`
Redis runs in loopback protected-mode only. An `/etc/hosts` alias `127.0.0.1 redis-local` exists so the render worker can connect (see below).

### Env files (gitignored, live in the VM snapshot)
`fastapi/.env` and `frontend/.env.local` are gitignored and were created during setup; they persist in the snapshot. If missing on a fresh machine, recreate from `.env.example`. Key local values:
- `NEXTAUTH_SECRET` MUST be identical in both files or all protected API routes 401.
- `MONGODB_URI=mongodb://127.0.0.1:27017/quickaishort`, `REDIS_URL=redis://localhost:6379`.
- No-spend AI: `ENVIRONMENT=staging` + `MOCK_AI_MODE=true` make the AI editor/agents return schema-valid fixtures with no Gemini credits/egress. `GEMINI_API_KEY` can be any placeholder in this mode.

### Auth for local testing
Email/password (NextAuth CredentialsProvider) works locally without Google OAuth. Register a user via `POST /api/auth/register` (name/email/password, ≥8 chars) — it writes to local MongoDB. To call the backend directly, mint an HS256 JWT signed with `NEXTAUTH_SECRET` (claim `sub` = user id); this mirrors the frontend's `mintBackendToken`.

### `/health` field meaning (non-obvious)
`/health` `mongo` and `gcs` booleans both reflect the GCS/Firestore ADC state (`db_is_ready()`), NOT the local MongoDB that NextAuth uses. Locally (no GCP credentials) both are `false` and `firestore_status`/`storage_status` are `disconnected` — this is expected and does not mean the app DB is down. `redis` and `adk` should be `true`.

### Render worker caveat
`render_worker.py` does NOT load `.env` and its `validate_env()` hard-rejects `REDIS_URL` starting with `redis://localhost` or `redis://127` (a Cloud Run guard). To run it locally, export env first and use the loopback alias, e.g.:
`cd fastapi && set -a; . ./.env; set +a; export REDIS_URL="redis://redis-local:6379"; ./venv/bin/python render_worker.py`
It logs `DB init failed ... Application Default Credentials` (no GCS locally) but still starts and listens on `render_queue`; real exports need GCP ADC.

### Known dev-mode editor caveat (fixed 2026-08-22)
Empty `/editor` in `next dev` (React 18 StrictMode) used to throw "Maximum update depth exceeded" and ErrorBoundary replaced the shell. Runtime stack was `ServerExportHost` → `serverExportStore.setControllers`, not Radix `composeRefs`. `useServerExport` returned a new `cancelExport` function every render; `EditorLayout` subscribed to that function and re-rendered the host. Fix: `useCallback` + no-op store writes. Ingest-time crashes should be re-checked against this path first. Backend `POST /api/ai-editor/command` under `MOCK_AI_MODE` remains the no-spend AI round-trip.

### Other notes
- Node: repo pins conflict (`.nvmrc`=20 vs `frontend/package.json` engines `24.x`). The VM's Node 22 works; engines is not enforced (pnpm only warns).
- `pytest`/`pytest-asyncio` are not in `requirements.txt` (the update script installs them). Two pre-existing tests reference symbols removed from `render_worker.py` (`apply_tier_render_policy`, `check_user_tier`) → 1 collection error + 1 failure; unrelated to environment setup. The rest pass (171 passing).
- Backend lint tools (`black`, `flake8`) are not in `requirements.txt`; CI pins `black==26.5.1`. `pip install` them in the venv on demand for backend lint.
