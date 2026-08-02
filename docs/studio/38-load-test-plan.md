# 38 — Load-test plan (written; paid platform = FOUNDER only)

**Goal:** Prove chat-first path survives concurrent users without inventing spend.  
**Date:** 2026-08-02 · **Spend gate:** no k6 Cloud / Locust SaaS / extra Cloud Run min-instances without FOUNDER OK.

## What to measure (free / local first)

1. `POST /api/ai-editor/command/stream` — p50/p95 latency under MOCK_AI (`MOCK_AI_MODE=true`) — zero Gemini $.
2. `POST /api/render` enqueue → Redis status only (no full ffmpeg) for dispatch path.
3. Pusher fan-out: one export status with poll backoff when connected (12s) vs disconnected (3s).
4. Rate limits: AI editor 20/min, dub create 10/min, orchestrator 40/min — expect 429 not crash.

## Suggested local recipe (no paid tools)

```text
# From fastapi/ with MOCK_AI_MODE=true — use any HTTP bench you already have
# Example shape (do not run paid cloud):
#   N concurrent JWT users × M stream requests
# Success: no 5xx storm; SlowAPI 429 under abuse; CostGuard cache hits rise on identical payloads
```

## Gate 5 (only if measured)

CDN / WAF / multi-region / API min-instances — open Engineering Decision with numbers, cost unit, cheaper alternative.

## Not claimed

Live production load test has **not** been run in this pass.
