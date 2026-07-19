# ADR-001 — Client-side NLE Action Execution

- **Status:** Accepted for **preview latency only** — end-state authority **superseded by ADR-008**  
- **Date:** 2026-07-18 (amended 2026-07-19)  
- **Deciders:** Architecture audit; Phase 2 A10; ADR-008  

## Context

Studio vision wants real editing tools. The codebase already applies AI actions in the browser via Zustand (`applyAiEdits` / `dispatchAIActions`) after FastAPI returns sanitised JSON.

## Decision

Keep **client-side execution as the interactive preview projector** for latency and optimistic UX.  
**Do not** treat the browser store as the multi-year source of truth — that role belongs to the Project Kernel (ADR-008 / EP-002).

## Consequences

- Positive: Instant preview, local scrubbing, optimistic apply  
- Negative: Must reconcile to server Ack/revision  
- Follow-up: EP-002 Project Kernel (in progress)

## Evidence

`frontend/src/hooks/useAiCommander.ts`, `frontend/src/stores/editorStore.ts`, `fastapi/routers/ai_editor_router.py`
