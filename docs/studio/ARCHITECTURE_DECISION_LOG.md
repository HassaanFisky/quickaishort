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
| ADR-013 | Editor Ingest Parity + Onboarding + Ads CS | **Accepted** | EP-008 implemented |

## Latest binding change

2026-07-20: EP-008 **implemented** + ADR-013 accepted. Media Ingest Policy API, IngestSurface, onboarding tour, Ads Coming Soon. EP-001/Kernel/MediaGraph suggestion rules untouched.

2026-07-19: Execution cycle close — production-ready gate. TD-EP001-03 FE legacy dialect translator removed (canonical-only client path; BE remains normalizer). Ops Kernel flag enablement is deploy handoff, not architecture change.

Prior same-day: Soak hardening — pipeline JWT (TD-LEGACY-01), heuristic suggestion removal, Kernel chat commit via `structured_steps`, CI registry hash sync.
