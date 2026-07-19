# 18 — Migration Strategy

## Principle

**Strangler evolution** around existing editorStore + ai_editor + RQ — not a greenfield rewrite.

---

## Migration waves

### Wave A — Correctness

1. Auth + credits fail-closed  
2. URI scheme fix (`gs://`)  
3. Action coverage matrix; disable unsupported tool emissions in sanitiser  

### Wave B — Contract

1. Introduce `tools` registry module  
2. Both `/api/ai-edit` and `/api/ai-editor/command` call same planner  
3. Deprecate one endpoint after FE cutover  

### Wave C — UX

1. Feature flag `STUDIO_CHAT_PRIMARY` (env or remote config)  
2. Default on for new sessions; advanced URL remains  

### Wave D — Server tools

1. Add `/api/tools/execute` with idempotency keys  
2. Move only bake-heavy ops first  
3. Chat shows progress via existing Pusher patterns  

### Wave E — Legacy freeze

1. Mark `/api/v1/video/*` deprecated in OpenAPI/docs  
2. Stop new FE callers  
3. Remove Celery path after metrics prove zero traffic  

---

## Rollback strategy

| Wave | Rollback |
|------|----------|
| A | Revert PR; secrets unchanged |
| B | FE points back to legacy endpoint; keep dual handlers |
| C | Flag off |
| D | Tools no-op → fall back to client-only actions |
| E | Re-enable router include |

---

## Data migration

- No bulk media move required if GCS already primary  
- Project documents: add `renderManifest` field nullable — backward compatible  
- Do not delete GridFS buckets without consent + traffic proof
