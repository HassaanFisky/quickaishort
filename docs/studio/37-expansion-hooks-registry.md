# 37 — Expansion Hooks registry (keep current)

**North star:** ingest → chat → preview → export. New capability ships only if **all** hooks pass.

| Hook | Requirement | Skip failure |
|------|-------------|----------------|
| H1 Center | Strengthens the sacred loop | Dual UX / orphan feature |
| H2 Flag | Env/feature flag default OFF | Blast radius on deploy |
| H3 Registry | EP-001 Capability Registry entry | Model escapes sandbox |
| H4 CostGuard | Cache key + credit gate + attribution | Gemini burn / dupes |
| H5 Owner | JWT `verified_user_id` sole tenant | Cross-tenant spoof |
| H6 Continuum | Empty/loading/error/success/cancel designed | Silent −2 fails |
| H7 Rollback | One-flag or one-revision revert | Stuck bad release |
| H8 Anti-scope | Not second LLM / second tool ABI / always-on worker / native apps pre-mobile excellence | Stack sprawl |

## Client surface (authenticated)

| Surface | Role |
|---------|------|
| `frontend/src/lib/api.ts` | Axios + JWT interceptors: stats, export, dub, orchestrator, health, ADK helpers |
| `frontend/src/lib/gemini-editor.ts` | SSE stream chat → `/api/ai-editor/command/stream` via `authenticatedFetch` (same JWT) |
| `frontend/src/lib/aiEditorClient.ts` | **Deprecated** — Next `/api/ai/editor` proxy; scripts only |

## Approved lanes

- ADR-006 FunctionDeclaration (`STUDIO_NATIVE_TOOLS`, default OFF)
- Locale EN+1 when retention data demands (i18n JSON only)
- CDN / WAF only when Gate 5 measured pain trips
- Dub languages after EN-source live smoke

## Rejected lanes

Second LLM · second tool ABI · GridFS primary · always-on RQ in prod · LaunchDarkly-class flag SaaS without need.

**Last verified:** 2026-08-02 (code).
