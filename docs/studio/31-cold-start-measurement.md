# 31 — Cloud Run API cold-start measurement

**Status:** Measurement guide (no always-on / min-instances without founder Gate 5)  
**Date:** 2026-08-02  
**Related:** Global Chat Scale Plan Weeks 3–4; cost-efficient architecture policy

## Goal

Measure p95 time-to-first-byte for `GET /health` and `POST /api/ai-editor/command` (or `/command/stream`) after idle scale-to-zero, so we know whether cold start hurts ChatGPT-class ack — **without** paying for always-on CPU.

## Procedure (founder / SRE)

1. Confirm API service `quickai-api` in `us-central1` with request-based CPU (scale-to-zero allowed).
2. Idle ≥ 15 minutes (or force scale to zero via console if available).
3. From a warm client network:
   ```bash
   # Cold
   curl -s -o /dev/null -w "%{time_starttransfer}\n" https://<api-host>/health
   # Immediately warm
   curl -s -o /dev/null -w "%{time_starttransfer}\n" https://<api-host>/health
   ```
4. Repeat 10× across a day; record p50/p95 cold vs warm.
5. Optional AI path (after Gemini credits healthy + JWT):
   - Time until first SSE stage event from `/api/ai-editor/command/stream`.
   - UI already shows instant local ack (`Got it — planning your edit…`) before network returns.

## Decision thresholds (Gate 5)

| Metric | Keep scale-to-zero | Consider min-instances=1 (FOUNDER spend) |
|--------|--------------------|------------------------------------------|
| `/health` cold TTFB p95 | &lt; 3s | ≥ 5s AND chat complaints |
| First SSE stage p95 | &lt; 4s after ack | ≥ 8s AND retention impact |

Cheaper alternatives before min-instances: keep ADK imports request-lazy; stream stages; Redis warm for PlanStore/backpressure only (already ephemeral).

## Anti-scope

- Do not set `min-instances > 0` from this doc alone.
- Do not reintroduce always-on RQ wake listeners.
