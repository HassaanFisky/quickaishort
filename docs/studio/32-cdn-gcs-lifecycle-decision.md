# 32 — CDN + GCS lifecycle decision pack (Gate 5 / Weeks 11–12)

**Status:** Decision draft — **no paid CDN / no destructive GCS deletes** without founder approval  
**Date:** 2026-08-02  
**Related:** Global Chat Scale Plan; cost-efficient architecture policy

## CDN for exports / static

| Item | Value |
|------|-------|
| **Necessity** | Only when measured media TTFB or egress pain at ~1M MAU (Gate 5) |
| **$/unit** | CDN egress $/GB + request fees (vendor-specific) |
| **Cheaper alternative** | Short-TTL HMAC signed GCS URLs (`signing.py`) + Vercel for FE assets only |
| **Selected now** | **KEEP signed GCS** — do not add Cloudflare/Cloud CDN product path yet |
| **Trigger to revisit** | p95 download TTFB ≥ 3s OR monthly GCS egress exceeds founder budget envelope |

## GCS lifecycle (uploads / exports)

| Prefix | Proposed TTL | Why | Approval |
|--------|--------------|-----|----------|
| `uploads/{uid}/` | 7–30 days | Ingest scratch; re-upload if needed | **FOUNDER before any lifecycle rule** |
| `exports/{uid}/` | TBD (30–90d) | User deliverables — deleting = data loss | **FOUNDER** |
| `tts_cache/` | 7–14 days | Regenerable | **FOUNDER** |

**Cheaper alternative to early TTL:** monitor bucket size monthly; manual prefix cleanup with explicit consent.

**Anti-scope:** no `gsutil rm` / lifecycle apply from agents without founder yes.

## Load-test plan (written only)

1. Auth: mint HS256 JWT locally; `MOCK_AI_MODE=true` for AI paths (zero Gemini $).
2. Targets: `GET /health`, `POST /api/ai-editor/command` (mock), `POST /api/process-video` enqueue only (no real ffmpeg burn unless founder OK).
3. Tooling: k6 or vegeta **only after founder OK** if SaaS/cloud runners cost money; prefer local concurrency first.
4. Success: p95 health &lt; 500ms warm; AI mock p95 &lt; 1s; no 5xx storm; Redis memory stable.
5. Stop rule: abort if real Gemini/GCS render spend would start.

## Abuse limits (shipped in-repo)

- Global SlowAPI 200/min + AI editor routes **20/min** via `core/rate_limit.py`
- CostGuard exact-state cache + provider token bucket remain spend fence
