# EP-005 — Chat-Primary Studio Shell

**Status:** APPROVED FOR IMPLEMENTATION  
**Priority:** P0 — Phase 2 Part G step 5  
**Depends on:** EP-001…004 (honesty substrate)  
**ADR:** ADR-011  

## Decision (U1)

Default `/editor` priority:

1. Chat (AIPanel) — open by default once media is loaded  
2. Preview canvas — watch surface  
3. Timeline dock — collapsed height by default; expand on demand  
4. Advanced inspectors — `?advanced=1` only  

Deferred features stay Coming Soon / non-interactive.

## v1 ship

- Auto-open AIPanel when `videoMetadata` present  
- Collapsible timeline footer (`h-14` collapsed / `h-44` expanded)  
- Persist expand preference in sessionStorage key `qai_timeline_expanded`
