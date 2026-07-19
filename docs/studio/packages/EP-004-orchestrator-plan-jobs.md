# EP-004 — Orchestrator Plan Jobs

**Status:** APPROVED FOR IMPLEMENTATION  
**Priority:** P0 — Phase 2 Part G step 4  
**Depends on:** EP-001, EP-002, EP-003  
**ADR:** ADR-010  

## Objective

Turn Intent (chip or chat) into an auditable **Plan** of Capability steps, then optionally **execute** mutating steps through the Project Kernel with CommandAck honesty.

> Orchestrator never bypasses EP-001 emit policy.  
> Orchestrator never writes Firestore events except via Project Kernel.  
> Chat never claims success without Ack when Kernel execute is requested.

## v1 scope

1. `POST /api/studio/v1/orchestrator/plan` — structured SuggestionIntent or free-text → Plan  
2. `POST /api/studio/v1/orchestrator/execute` — run plan steps via Kernel when `project_id` + `proposed_manifest` present  
3. Free-text planning reuses `process_editor_command` (Gemini) then maps actions → steps  
4. Structured capability intents skip LLM  
5. FE chip click uses structured plan path (no fake title heuristics)

## Out of scope

- Full multi-turn tool loop with observation  
- Native Gemini function calling (ADR-006 remains direction)  
- Chat-primary layout (EP-005)  
- Worker bake from Kernel revision  

## Plan schema

```text
Plan {
  plan_id, owner_user_id, created_at, status: draft|executing|completed|failed|partial
  source: suggestion|chat|automation
  intent_text: string | null
  steps: [{
    step_id, capability_id, params, status: pending|accepted|rejected|skipped
    command_id, event_ids[], reject_reason?
  }]
  project_id?: string
}
```

## Completion criteria

- Structured chip → Plan without LLM  
- Execute → Kernel Ack/Reject recorded on steps  
- EP-001 emit gate enforced for chat/orchestrator source  
- Tests + tsc green  
