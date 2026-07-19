# EP-004 Implementation Report

**Date:** 2026-07-19  
**Status:** Delivered (v1)  
**ADR:** ADR-010  

## Delivered

- `fastapi/services/orchestrator_service.py` — Plan + Kernel execute  
- `fastapi/routers/orchestrator_router.py` — `/api/studio/v1/orchestrator/{plan,execute,plans/{id}}`  
- Tests: 4 orchestrator + prior suite = **22 passed**  
- Editor AIPanel grounded chips → structured Plan → `dispatchAIActions` (+ Kernel execute when flag + project)

## Honesty rules enforced

- Chat/automation structured intents respect `orchestrator_emit`  
- Suggestion source may plan emit=false mechanical tools  
- NON_EVENT caps skipped on Kernel execute (client-local)  
- Mutating execute requires Strategy A `proposed_manifest`

## Not in this ship

- Native Gemini function-calling loop (ADR-006)  
- Full observation/verify multi-turn  
- Chat-primary layout (next)
