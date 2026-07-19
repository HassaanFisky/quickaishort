# EP-003 Implementation Report

**Date:** 2026-07-19  
**Status:** WS1–WS4 delivered  
**ADR:** ADR-009  
**EP-001:** Untouched  

## Delivered

- MediaGraph models + service (facet merge, pure suggestion derivation)
- API `/api/studio/v1/media-graphs/*`
- Tests: `tests/test_media_graph.py` (5) + EP-002 still green (12) = 18
- Editor AIPanel: heuristic chips removed; MediaGraph upsert + grounded rail
- Deprecated `generateImmediateSuggestions` / `INSTANT_SUGGESTIONS` (not product rail)
- Legacy `components/ai/AIPanel` video chips → non-interactive placeholder

## Flags

None required for honesty. Emergency rollback: restore old AIPanel path (not shipped as flag).

## Not in this ship

- Hard `requires_facets` gates on capabilities
- Face/scene deep facets
- Orchestrator consuming SuggestionIntent (EP-004)
