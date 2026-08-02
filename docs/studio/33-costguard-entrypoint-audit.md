# 33 — CostGuard / Gemini entrypoint audit

**Date:** 2026-08-02  
**DoD:** every live Gemini path either uses DualModelRouter (cache+limits) or is explicitly retired / credit-gated.

| Entrypoint | Path | CostGuard / DualModelRouter | Credits | Notes |
|------------|------|-----------------------------|---------|-------|
| AI Editor command | `POST /api/ai-editor/command` | YES via DualModelRouter | reserve/refund | Primary chat |
| AI Editor stream | `POST /api/ai-editor/command/stream` | YES | reserve/refund | Same router |
| AI Editor legacy | `POST /api/ai-edit` | YES | reserve/refund | FE proxy |
| Studio orchestrator plan | `POST /api/studio/v1/orchestrator/plan` | No Gemini (structured EP-001) | free | Capability ABI only |
| Studio orchestrator execute | `…/execute` | No Gemini | free | Manifest commit |
| Dub translate | dub_service → Gemini | Translation cache + fingerprint | deduct | ADR-014 |
| PreFlight credited | `POST /api/preflight` | Pipeline + credits | YES | Preferred |
| Legacy PreFlight predict | `…/predict` | **410 in production** | N/A | Retired unless `ENABLE_LEGACY_V1_PREFLIGHT` |
| ADK viral/preflight agents | agent runners | call_gemini + backpressure | route-dependent | Lazy import |
| MOCK_AI_MODE | all | No Google HTTP | N/A | Blocked when `ENVIRONMENT=production` |

**Attribution:** `gemini_client.call_gemini` logs `gemini_call_ok|failed|deferred` with model + elapsed_ms + response_chars — **never** prompt/transcript bodies.

**Admin:** `GET /api/admin/ai-cache/stats` (X-Admin-Secret) — cache hit-rate + DLQ + circuit.
