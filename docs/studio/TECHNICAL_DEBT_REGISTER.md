# Technical Debt Register

| ID | Severity | Item | Owner EP | Status |
|----|----------|------|----------|--------|
| TD-EP001-01 | Medium | Orphan FE `EDITOR_SYSTEM_PROMPT` in gemini-editor.ts | EP-001 follow-up | **Closed** — removed with `callGeminiEditor` |
| TD-EP001-02 | Medium | No JSON-Schema engine for capabilities | EP-001 follow-up | Open |
| TD-EP001-03 | Low | Legacy `translateToolActionToLegacy` safety net | EP-001 follow-up | **Closed** — FE drops non-canonical; BE normalizes |
| TD-EP001-04 | Medium | No CI BE↔FE registry hash check | EP-001 follow-up | **Closed** — `check_registry_sync.py` in CI |
| TD-EP002-01 | High | Dual project collections (`Projects` vs `studio_projects`) during migration | EP-002 | Accepted debt |
| TD-EP002-02 | Medium | No pure Python Manifest reducer (Strategy B deferred) | EP-002 | Accepted — E1 Strategy A |
| TD-LEGACY-01 | High | Unauthenticated `POST /api/pipeline/run` | Security | **Closed** — JWT + credits fail-closed |
| TD-UI-01 | Low | Agency “Coming Soon” on pricing only | Product | Intentional |
| TD-UI-02 | Medium | Dual AI panels (dashboard fake edits) | Product | **Closed** — dashboard FAQ + `/editor` CTA only |
| TD-EP003-01 | Low | Deprecated `INSTANT_SUGGESTIONS` | EP-003 | **Closed** — removed |
| TD-EP003-02 | Medium | Suggestion chip click free-text not structured Intent | EP-004 | **Closed** — Plan path |
| TD-EP003-03 | Medium | Orphan Next route `/api/ai/suggestions` invent landmine | EP-003 follow-up | **Closed** — returns 410 |
| TD-EP003-04 | High | `StudioProjectHead.media_graph_id` never written | EP-003 | **Closed** — bind on ensure |
| TD-EP003-06 | Medium | Kernel-on orphan `createMediaGraph(null)` | EP-003 FinOps | **Closed** — skip when Kernel on without projectId |
| TD-EP002-03 | Medium | AI edits not auto-committed to Kernel | EP-004 | **Closed** when flag on (structured_steps) |

Update this file whenever debt is introduced or retired.
