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

## Latest binding change

2026-07-19: Soak hardening — pipeline JWT (TD-LEGACY-01), heuristic suggestion removal, Kernel chat commit via `structured_steps`, CI registry hash sync.
