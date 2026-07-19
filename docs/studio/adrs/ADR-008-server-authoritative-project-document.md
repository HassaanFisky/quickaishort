# ADR-008 — Server-Authoritative Project Document

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Package:** `docs/studio/packages/EP-002-server-authoritative-project-document.md`  
- **Supersedes (end-state only):** ADR-001 permanent client timeline authority  
- **Preserves from ADR-001:** Client remains the low-latency preview projector (optimistic apply)

## Context

Interactive edits lived only in Zustand. Reload, automation, collaboration, and honest AI receipts require a server causal log. Phase 2 Decision A10 mandated dual-layer state.

## Decision

1. **Authoritative log** = append-only `ProjectEvent` stream on Firestore under `studio_projects/{id}/events`.  
2. **Authoritative snapshot** = materialized `RenderManifest` + monotonic `revision` on project head.  
3. **Mutations** = `ProjectCommand` → Kernel → Event(s) → Ack (never client PATCH of snapshot/revision).  
4. **Materialization v1 (Errata E1)** = client proposes Manifest; server validates and accepts in the same transaction as the event.  
5. **EP-001** gates chat/orchestrator emit; UI-direct may use emit=false; transport capabilities are non-events (E2).  
6. **Conflict** = optimistic concurrency on `base_revision`; v1 reset-to-head.  
7. Legacy ADK `Projects` collection remains; Studio uses `studio_projects` + `/api/studio/v1`.

## Consequences

- Positive: Deterministic replay, audit, AI ToolResults, bake-by-revision, collab readiness  
- Negative: Larger impl surface; dual collections during migration  
- Follow-up: EP-003 MediaGraph; EP-004 Orchestrator; optional Python reducer (Strategy B)

## Evidence

EP-002 validation gate; `project_service.py` (legacy); `compileRenderManifest.ts`; `render_manifest.py`; EP-001 registry
