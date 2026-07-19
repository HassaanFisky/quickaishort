# 12 — Deployment

## Target topology

```text
GitHub → (lint) → build images (Cloud Build)
                 → Cloud Run: quickai-api
                 → Cloud Run: quickai-worker
Vercel ← frontend/ (Next.js)
Cloudflare DNS ← quickaishort.online
```

---

## Backend deploy

Primary scripts: `deploy_production.ps1` / `deploy_production.sh`.

Typical concerns encoded in CLAUDE:
- Startup probe `failureThreshold=20`, `timeoutSeconds=5`
- `/ready` must not block on heavy Redis pings
- `run_startup_checks()` deferred as background task
- Worker min instances / concurrency for ffmpeg

Use `--async` for long deploys when disk constrained.

---

## Frontend deploy

- Vercel project from `frontend/`  
- Env: `NEXTAUTH_SECRET` must match API  
- `NEXT_PUBLIC_*` only for public values  

---

## Health gates post-deploy

```bash
curl -sS "$PUBLIC_API_URL/health"
curl -sS -H "X-Admin-Secret: $ADMIN_SECRET" "$PUBLIC_API_URL/api/render/dlq/stats"
curl -sS -H "X-Admin-Secret: $ADMIN_SECRET" "$PUBLIC_API_URL/api/admin/pipeline/health"
```

Expected shape (historical): `status:ok` with mongo/redis/adk flags — re-verify live.

---

## Rollback

1. Cloud Run → previous revision  
2. Vercel → previous deployment  
3. Do **not** `gsutil rm` production media without explicit consent  

---

## Known historical blockers (may recur)

From CLAUDE / PRODUCTION_STATUS:
- GCP billing delinquent → GCS 403 `accountDisabled`  
- Invalid `GEMINI_API_KEY` → agents degrade  
- Missing `GOOGLE_TTS_API_KEY` → silent voiceover  
- Firestore IAM propagation delay after role grants  

Treat as operational checklist, not current status, unless re-verified.
