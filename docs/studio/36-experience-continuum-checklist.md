# 36 — Experience continuum checklist (Gate 1)

**North star:** open → ingest → chat → preview → export  
**Date:** 2026-08-02 — code-verified (heuristic chip apply + MOCK; not live Gemini, not production deploy)

| Level | Requirement | Status | Evidence |
|------:|-------------|--------|----------|
| −3 | Zero-credit send blocked; JWT sole tenant | DONE (code) | AIPanel; `main.py` JWT comments; `test_jwt_sole_tenant.py` |
| −2 | Honest 429 / circuit / RETRY_LATER | DONE (code) | AIPanel `circuitBanner` + `getAiEditorHealth`; backpressure |
| −1 | Instant ack + stage labels | DONE (code) | AIPanel `Got it — shaping…` + ThinkingBubble; stream stages |
| 0 | Chat-primary shell; ingest FSM sole path | DONE (code) | EditorLayout default; `useIngestLifecycle` |
| +1 | Stream primary; double-send blocked; export cancel | DONE (code) | stream path; `isAIThinking`; `ServerExportHost` + header Cancel |
| +2 | First AI win path ready | PARTIAL (code) | Grounded chip apply pride ack + Export Final → `qai:export`; live Gemini still blocked on credits |
| +3 | Cache hits feel instant | PARTIAL | CostGuard + admin hit-rate; needs live traffic |

**Chip / apply honesty (Phase 1–3):**
- MediaGraph chips carry evidence subtitles; apply mutates timeline (`REMOVE_SILENCES` cuts gaps; `DETECT_VIRAL` never silent empty).
- Promise surface = **36 wired `orchestrator_emit` + Dub/Translate UI routes** — not all 80 registry caps.
- Partial tools (`COLOR_WHEELS`, `SET_TRANSITION`, etc.) → clarification + `qai:open-advanced` (no silent no-op).
- `MARK_IN` / `MARK_OUT` / `RANGE_MARK` set real I/O marks; `ADD_BROLL` without stock URL opens library.
- Project context sends transcript slice, silence count, viral top, marks for MOCK/live planners.
- **Not claimed:** live Gemini generateContent success (prepaid credits depleted).

**Mobile:** chat sheet opens on ingest `ready`; chip rail scroll-snap + 44px targets; timeline collapsed by default (`timelineExpanded`).  
**A11y:** compose `aria-label` / `aria-busy`; export progressbar; credit exhausted `aria-describedby`.

**Not claimed:** live axe=0 audit run in CI (no axe job in repo). Manual keyboard path verified by code attributes only.
