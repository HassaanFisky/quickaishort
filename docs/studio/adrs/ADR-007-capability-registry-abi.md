# ADR-007 — Capability Registry ABI

- **Status:** Accepted  
- **Date:** 2026-07-18  
- **Package:** `docs/studio/packages/EP-001-capability-registry-abi.md`  
- **Related:** Phase 2 Decisions A9, A5e, A8; ADR-006 (native FC later consumes this registry)

## Context

Editing tools are defined in four drifting places: `AiEditorAction` unions, `ToolName` (17 Premiere-like names), hand-written Gemini prompts, and `aiToolCatalog.ts`. This prevents honest orchestration and will not scale to hundreds of tools.

## Decision

1. **Canonical capability id** = `AiEditorAction.type` string (SCREAMING_SNAKE).  
2. **Source of truth file** = `fastapi/capabilities/registry.v1.json` validated by `schema.v1.json`.  
3. **`ToolName` is deprecated** — aliases only via `aliases.v1.json` for one compatibility release.  
4. **`orchestrator_emit: false`** blocks LLM emission even if Pydantic accepts the type.  
5. Planner prompts and future Gemini FunctionDeclarations are **generated from the registry**, never hand-maintained lists.  
6. Implementation package EP-001 is binding for the first merge.

## Consequences

- Positive: Single ABI for 5–10 year tool growth; fail-closed honesty  
- Negative: Some previously “advertised” tools stop emitting until wired  
- Follow-up: EP-002 ProjectDocument events reference `capability_id`

## Evidence

`fastapi/models/ai_editor.py`, `fastapi/services/ai_editor_engine.py`, `frontend/src/lib/aiToolCatalog.ts`, `frontend/src/stores/editorStore.ts`
