# Architecture Decision Log

Living index. Full ADRs live under `docs/studio/adrs/`.

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| ADR-001 | Client-side NLE execution | Accepted (preview only) | End-state superseded by ADR-008 |
| ADR-002 | (see adrs/) | — | — |
| ADR-003 | (see adrs/) | — | — |
| ADR-004 | RenderManifest | Accepted | Bake contract |
| ADR-005 | (see adrs/) | — | — |
| ADR-006 | Native function calling | Accepted direction | Later EP |
| ADR-007 | Capability Registry ABI | Accepted | EP-001 frozen |
| ADR-008 | Server-Authoritative Project Document | Accepted | EP-002; Errata E1–E5 |
| ADR-009 | MediaGraph + Grounded Suggestions | Accepted | EP-003; A5a enforced |
| ADR-010 | Orchestrator Plan Jobs | Accepted | EP-004; Plan → Kernel |
| ADR-011 | Chat-Primary Studio Shell | Accepted | EP-005 |
| ADR-012 | Bake from Kernel Snapshot | Accepted | EP-006 |
| ADR-013 | Editor Ingest Parity + Onboarding + ADK CS | **Accepted** | EP-008 + ADK≠Ads correction implemented |
| ADR-014 | Dub Video Pipeline | **Accepted** | Translate + TTS + mute/replace export |
| ADR-015 | Studio Genius OS | **Accepted** | Chat-native Phase 1; Luna/Terra profiles; FC = Phase 2 |
| ADR-016 | Decision-Gated Edit (M0) | **Accepted** | Decision Intelligence WHAT/WHY; Pre-Flight stays optional specialist; Orchestrator HOW; Registry capabilities; Kernel execution; no parallel ABI |

## Latest binding change

2026-08-25: **Typed-chat director loop** on ADR-016 — `/api/ai-editor/command` intercepts dead-air / shorts-packaging / restore-opening before DualModelRouter and credit charge. Redis latest DecisionRecord enables “keep the original opening” on the same project. Unrelated chat remains DualModelRouter. `AUTO_REFRAME` stays emit=false.

2026-08-20: **ADR-016 Decision-Gated Edit (M0→F)** on branch — `75905cf` contracts; `1c76353` orchestrator `decision_gate` + `execution_integrity`; `10ba9a7` router JWT HTTP tests; `64acb9e` Tier 0 `event_ids`; `5d60fdc` execute-time MediaGraph segment re-verify. Pre-Flight not the brain; no `objective_verified`.

2026-08-20: **ADR-016 Decision-Gated Edit (M0)** accepted — deterministic DecisionRecord in front of Orchestrator; dead-air path uses existing `REMOVE_SILENCES` + MediaGraph silence evidence; 0 Gemini; Pre-Flight is not the brain. Branch follow-ons: gated Orchestrator, `execution_integrity` (never `objective_verified`), JWT HTTP proof, Kernel `event_ids` + post-execute event readback. **Remaining:** see ADR-016 remaining-work A–E. Vision is not complete. Frontend default chat is still ungated DualModelRouter.

2026-07-26: **ADR-015 Studio Genius OS** accepted — Redis orchestrator plans; multi-turn + stream chat; universal suggestion copy; docked Dub; real ADD_SFX preview; movie-length dub deferred; UI brand = QuickAI only.

2026-07-25: **ADR-014 Dub Video** accepted — staged translate/TTS/align pipeline; EN-source Whisper; Google TTS; Cloud Tasks `/tasks/dub`; captions-only fallback.

2026-07-20: EP-008 **implemented** + ADR-013 accepted. Same day: **`APPROVE ADK CORRECTION`** — Ads nav/page removed; `/adk` is Google Agent Development Kit Coming Soon workspace with reserved IA skeleton. Legacy ADK Studio wizard archived off-route. EP-001/Kernel/MediaGraph untouched.

2026-07-19: Execution cycle close — production-ready gate. TD-EP001-03 FE legacy dialect translator removed (canonical-only client path; BE remains normalizer). Ops Kernel flag enablement is deploy handoff, not architecture change.

Prior same-day: Soak hardening — pipeline JWT (TD-LEGACY-01), heuristic suggestion removal, Kernel chat commit via `structured_steps`, CI registry hash sync.
