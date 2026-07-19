# 20 — API Reference (Verified)

This is an evidence-based inventory, not OpenAPI export. Paths verified via router includes + `@app` routes audit (2026-07-18). Re-grep `main.py` before release notes.

## Public / health

| Method | Path | Auth |
|--------|------|------|
| GET | `/`, `/health`, `/ready`, `/metrics` | none |
| GET | `/health/live`, `/health/ready`, `/health/startup` | none |
| GET | `/debug/tiers` | verify |

## AI Editor

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/ai-edit` | JWT |
| POST | `/api/ai-editor/command` | JWT |
| POST | `/api/ai-editor/command/stream` | JWT |
| GET | `/api/ai-editor/health` | verify |

## Media / YouTube / export

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/youtube/info` | verify router |
| POST | `/api/youtube/clip` | verify |
| GET | `/api/info`, `/api/stream-info` | mixed |
| GET | `/api/proxy`, `/api/proxy-video`, `/api/audio` | mixed |
| POST | `/api/analyze`, `/api/process-video`, `/api/create-video` | JWT typical |
| GET | `/api/status/{job_id}` | mixed |
| GET | `/api/render/status/{job_id}` | mixed |
| DELETE | `/api/render/{job_id}` | JWT |
| GET | `/api/download/{job_id}` | signed |
| POST | `/api/video/presigned-url` | JWT |

## ADK / creative

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/adk/upload`, `/api/adk/enhance`, `/api/adk/generate` | JWT |
| GET | `/api/adk/stock` | often open |
| POST | `/api/preflight`, `/api/direct` | JWT typical |
| GET | `/api/broll/search` | verify |
| GET | `/api/music` | verify |

## Pipeline / projects / stats

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/pipeline/run` | **NONE — gap** |
| GET | `/api/pipeline/{id}/status` | verify |
| GET/PATCH/DELETE | `/api/projects`, `/api/projects/{id}` | JWT |
| GET | `/api/stats` | JWT |
| WS | `/ws/stats/{user_id}` | verify |

## Admin / DLQ / analytics

| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/api/admin/cookies/*` | Admin secret |
| GET | `/api/admin/analytics/*` | Admin |
| GET | `/api/admin/pipeline/health` | Admin |
| POST | `/api/admin/referral-bonus` | Admin |
| GET | `/api/render/dead`, `/api/render/dlq/stats` | Admin typical |
| POST | `/api/render/retry/{job_id}` | Admin typical |
| POST | `/api/analytics`, GET `/api/analytics/summary` | mixed |
| POST | `/api/internal/email/*` | Admin/internal |
| POST | `/api/billing/webhook/paddle` | Paddle sig |

## Legacy v1

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/video/upload` | GridFS |
| GET | `/api/v1/video/task/{task_id}` | Celery |
| POST | `/api/v1/preflight/predict` | alt preflight |

## Agent runtime

| Method | Path |
|--------|------|
| GET | `/api/agent-runtime/health` |
| GET | `/api/agent-runtime/health/{agent_name}` |
| GET | `/api/agent-trace/{session_id}` |
