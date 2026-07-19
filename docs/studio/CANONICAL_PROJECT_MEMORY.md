# Canonical Project Memory

**Last rebuilt:** 2026-07-19 (Final Execution Authority — completion pass)  
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

## Part G Sequence

1–7 substrate ✅. Soak hardening ✅. Completion pass ✅:
- Pipeline JWT + fail-closed credits (20) + tests
- MediaGraph router ownership check (defense-in-depth)
- AIPanel runId/graph race guards + Kernel honesty receipts
- Export `ensureStudioProject` before bake bind
- Orphan `EDITOR_SYSTEM_PROMPT` / `callGeminiEditor` / `useAiCommander` removed
- Dashboard AIPanel = FAQ + `/editor` CTA (no fake timeline edits)
- Env examples document Kernel flags

## Runtime truth (verified)

- Studio Kernel: `/api/studio/v1/projects` + Firestore `studio_projects`  
- MediaGraph: `/api/studio/v1/media-graphs` + grounded suggestions  
- Orchestrator: `/api/studio/v1/orchestrator` (structured / structured_steps / free-text)  
- Pipeline: JWT required; body `userId` ignored; credits fail-closed  
- FE Kernel flag: `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1` (see `frontend/.env.example`)  
- BE Kernel: `STUDIO_PROJECT_KERNEL` default on (see `fastapi/.env.example`)  
- CI: `fastapi/scripts/check_registry_sync.py` in linter workflow  

## Active implementation

Studio OS substrate + soak + completion pass shipped on `main`.  
Ops: enable `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1` on Vercel staging/prod if not set.  
Optional later: ADR-006 native FC depth; multiplayer (founder approval).

## Non-negotiables

Never bypass EP-001. Never second source of truth. Never hidden state. Never weaken deterministic replay / audit / observability.
