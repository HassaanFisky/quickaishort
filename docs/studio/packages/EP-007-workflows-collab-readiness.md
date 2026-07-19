# EP-007 — Workflows / Collaboration Readiness

**Status:** DESIGN LOCKED — readiness only (no multiplayer ship)  
**Priority:** P1 — Part G step 7  
**Depends on:** EP-002 event log  

## Decision

Do **not** ship CRDT/OT multiplayer in this sprint.  

Collaboration readiness already present on StudioProjectHead:

- `collaborators[]`, `edit_lock`, actor stamps on events  

Workflows / AgentSkills remain future platform objects (Phase 2 A11).  

## Ship now

- Document reserved fields + forbid silent timeline mutations outside Kernel  
- Keep Pusher channels reserved for `project-{id}` fanout (not required for v1)

## Explicit non-goals

- Simultaneous multi-editor merge  
- Saved workflow marketplace  
- Agent skill store UI  

Founder approval required before implementing multiplayer.
