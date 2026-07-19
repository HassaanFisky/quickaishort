# ADR-009 — MediaGraph + Grounded Suggestions

- **Status:** Accepted  
- **Date:** 2026-07-19  
- **Package:** `docs/studio/packages/EP-003-mediagraph-suggestion-engine.md`  
- **Affirms:** Phase 2 A5a, D1, D6  

## Context

Suggestion chips were generated from title keyword maps (`INSTANT_SUGGESTIONS`). Phase 2 forbids heuristic creative recommendations as product truth.

## Decision

1. Persist a versioned **MediaGraph** per asset/project understanding run.  
2. Edge clients may upsert facets; server merges with provenance.  
3. **Suggestion Engine** is a pure derivation from MediaGraph facets (v1: no LLM).  
4. Clickable chips require `capability_id` (or explicit non-mutating analyze intent) + evidence.  
5. Heuristic title maps are deprecated and must not feed the product suggestion rail.

## Consequences

- Positive: Honest AI UX; planner can later use facets for `requires_facets`  
- Negative: Chips appear later (after edge analysis) — correct trade  
- Follow-up: EP-004 Orchestrator consumes SuggestionIntent → ProjectCommand
