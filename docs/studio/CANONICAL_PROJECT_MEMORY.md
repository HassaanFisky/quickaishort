# Canonical Project Memory

**Last rebuilt:** 2026-07-19 (Execution cycle close — production-ready gate)  
**Authority:** Latest accepted EPs / ADRs / founder decisions only

## Product

QuickAI Studio — premium AI-native video editing OS.  
Editor is the product; AI enhances the editor. Chat-primary UX direction (Phase 2); timeline visualizes AI + user decisions.

## Frozen / Accepted

| Artifact | Status |
|----------|--------|
| EP-001 Capability Registry ABI | FROZEN — do not modify unless verified defect |
| ADR-007 Capability Registry | Accepted |
| EP-002 Project Document + Errata E1–E5 | **IMPLEMENTED** |
| ADR-008 Server-Authoritative Project Document | Accepted |
| EP-003 MediaGraph + Grounded Suggestions | **IMPLEMENTED** |
| ADR-009 MediaGraph + Grounded Suggestions | Accepted |
| EP-004 Orchestrator Plan Jobs | **IMPLEMENTED** (v1 + structured_steps) |
| ADR-010 Orchestrator Plan Jobs | Accepted |
| EP-005 Chat-Primary Shell | **IMPLEMENTED** |
| ADR-011 Chat-Primary Shell | Accepted |
| EP-006 Manifest Bake from Kernel | **IMPLEMENTED** |
| ADR-012 Bake from Kernel Snapshot | Accepted |
| EP-007 Workflows/Collab readiness | Design-locked (no multiplayer) |
| Phase 2 Architectural Truth Review | Binding OS direction |
| ADR-001 | Preview latency only; end-state superseded by ADR-008 |

## Execution cycle status

**COMPLETE (code).** Substrate EP-001…007 + soak + completion gate verified.  
Report: `docs/studio/packages/EP-COMPLETION-CYCLE-IMPLEMENTATION-REPORT.md`

Closed in final gate:
- TD-EP001-03 — FE legacy `{tool,params}` translator removed (server normalize only)
- Full gate: pytest 127 · tsc 0 · lint 0 · registry OK · Bugbot clean
- EP-001 files untouched

## Runtime truth (verified)

- Studio Kernel: `/api/studio/v1/projects` + Firestore `studio_projects`  
- MediaGraph: `/api/studio/v1/media-graphs` + grounded suggestions  
- Orchestrator: `/api/studio/v1/orchestrator`  
- Pipeline: JWT + fail-closed credits  
- FE: `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1` (`.env.example`)  
- BE: `STUDIO_PROJECT_KERNEL` default on  
- CI: `check_registry_sync.py` in linter workflow  

## Active / blocked on founder

| Item | Owner |
|------|--------|
| Enable Kernel FE flag on Vercel staging/prod | Ops / founder |
| Confirm Cloud Run Kernel not forced off | Ops / founder |
| ADR-006 native FC depth | Optional later |
| Multiplayer | Founder approval (EP-007) |
| Delete legacy `Projects` | Irreversible — founder consent |

## Non-negotiables

Never bypass EP-001. Never second source of truth. Never hidden state. Never weaken deterministic replay / audit / observability.
