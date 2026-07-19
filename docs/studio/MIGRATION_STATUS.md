# Migration Status

**Last updated:** 2026-07-19

## Project storage

| Layer | Collection / API | Role | Status |
|-------|------------------|------|--------|
| Legacy ADK | Firestore `Projects` / `/api/projects` | ADK wizard projects | Live — do not break |
| Studio Kernel | Firestore `studio_projects` / `/api/studio/v1` | Authoritative edit log | **Live (code)** — dual-run |
| Dual-run | Both | BE `STUDIO_PROJECT_KERNEL` + FE `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL` | Required until cutover |

## EP-001

Registry live; FE sync copy at `frontend/src/lib/generated/capabilities.v1.json`. Frozen.  
CI enforces BE↔FE SHA-256 match via `fastapi/scripts/check_registry_sync.py`.

## Soak readiness

- Pipeline endpoints JWT-gated  
- Editor chat commits to Kernel when FE flag on (structured_steps, no double LLM)  
- Export Kernel snapshot authority when `project_id` present  

## EP-002 cutover criteria (future)

- Kernel CRUD + commands + undo/redo green in **prod** (flag on)  
- FE projector stable under load  
- Explicit founder approval before deleting legacy `Projects` path  

## Irreversible ops

No production Firestore/GCS deletes without explicit founder consent.
