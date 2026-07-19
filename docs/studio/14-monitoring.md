# 14 — Monitoring

## Health surfaces

| Endpoint | Purpose |
|----------|---------|
| `/health` | Aggregate ok + dependency flags |
| `/ready`, `/health/ready`, `/health/startup` | Probes |
| `/metrics` | Metrics export (verify format before Prom scrape) |
| `/api/ai-editor/health` | AI editor |
| `/api/agent-runtime/health` | Agents |
| `/api/admin/pipeline/health` | Pipeline runs |
| `/api/render/dlq/stats` | Dead letter |

---

## Sentry

- Backend: `sentry-sdk[fastapi]` + `services/observability.py`  
- Frontend: `@sentry/nextjs`  
- Setup notes: `docs/SENTRY_SETUP.md`, `docs/OBSERVABILITY.md` — validate against current init code before trusting DSN instructions  

---

## Realtime observability

- Pusher export progress events  
- WS stats  
- Redis streams `render:jobs|results|dead`  

---

## Gaps vs Studio needs

| Need | Status |
|------|--------|
| Per-tool latency/cost metrics | Partial / Insufficient evidence of full tool telemetry |
| Edit-session funnel analytics | `routers/analytics.py` ingest exists — coverage unverified |
| Agent trace UI | `/api/agent-trace/{session_id}` exists — FE usage Insufficient evidence |
