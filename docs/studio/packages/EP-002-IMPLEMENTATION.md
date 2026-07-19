# EP-002 Implementation Plan

**Status:** Active  
**Package:** `EP-002-server-authoritative-project-document.md`  
**ADR:** ADR-008  

## Workstreams

### WS1 — Kernel core
- **Objective:** Pydantic models + Firestore repository + atomic command transaction  
- **Scope:** `fastapi/models/studio_project.py`, `fastapi/services/project_kernel.py`  
- **Dependencies:** EP-001 `tool_registry`, Firestore client pattern from existing services  
- **Deliverables:** create/get/append_command with E1–E5  
- **Risks:** Firestore transaction limits; missing ADC in CI → use fakes in tests  
- **Validation:** unit tests with fake store  
- **Done when:** command→event→head update atomic; conflict + idempotency covered  

### WS2 — Studio v1 API
- **Objective:** HTTP surface under `/api/studio/v1/projects`  
- **Scope:** router + auth JWT + feature flag  
- **Dependencies:** WS1  
- **Deliverables:** create, get, head, events, commands, undo/redo  
- **Done when:** OpenAPI-visible routes; 401 without JWT  

### WS3 — Tests + wire
- **Objective:** pytest + `main.py` include router + py_compile  
- **Dependencies:** WS1–WS2  
- **Done when:** tests pass; py_compile clean  

### WS4 — FE projector (flagged)
- **Objective:** Optimistic apply + Ack reconcile; export fields  
- **Scope:** minimal client + editorStore/export payload behind `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL`  
- **Done when:** flag off = zero behavior change; flag on can create/command  

## Out of scope
EP-003/004, EP-001 edits, chat UI rewrite, Strategy B reducer
