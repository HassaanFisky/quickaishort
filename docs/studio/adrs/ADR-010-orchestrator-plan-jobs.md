# ADR-010 — Orchestrator Plan Jobs

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Package:** `EP-004-orchestrator-plan-jobs.md`  

## Decision

Introduce a Plan object as the bridge between Intent and Project Kernel commands.  
Structured intents (MediaGraph suggestions) skip LLM. Free-text uses existing editor engine, then normalizes to Plan steps. Execution is Kernel-mediated when a Studio project + proposed_manifest are supplied.

## Consequences

Honesty receipts become possible; EP-005 chat-primary can show ToolResults without lying.
