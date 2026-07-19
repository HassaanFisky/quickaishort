# 13 — Operations

## Day-2 checklist

| Cadence | Action |
|---------|--------|
| Daily | DLQ stats; cookie validation status |
| Weekly | Pipeline health; Sentry error triage; credit anomalies |
| Monthly | Dependency pins review; GridFS traffic check; cost (Gemini + Cloud Run) |

---

## Key admin endpoints

Require `X-Admin-Secret`:

- Cookie status/validate  
- Analytics latency/errors/tokens  
- Pipeline health  
- Referral bonus  
- DLQ list/retry/stats (some may be admin-gated — verify handlers)

---

## Cookie rotation

`cookie_rotator.py` + admin routes + Cloud Scheduler (documented every 6h). Critical for yt-dlp reliability.

---

## Worker recovery

- `recover_stale_jobs()` on boot  
- Manual retry via `/api/render/retry/{job_id}`  
- Inspect `render:meta:{id}` hashes  

---

## Data loss prevention

Before any `gsutil rm`, collection drop, or Cloud Run service delete: **explicit user consent** (workspace skill + CLAUDE rule).
