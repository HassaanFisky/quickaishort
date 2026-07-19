# EP-002 Implementation Report

**Date:** 2026-07-19  
**Status:** WS0–WS4 delivered (Kernel + API + tests + flagged FE projector)  
**ADR:** ADR-008  
**EP-001:** Untouched (frozen)

## Delivered

### Authority lock
- Binding Errata E1–E5 locked into EP-002 package
- ADR-008 accepted; ADR-001 amended (preview-only)
- Living docs: Canonical Memory, ADR Log, Debt Register, Roadmap, Migration Status

### Backend
| File | Role |
|------|------|
| `fastapi/models/studio_project.py` | Schema v2 models |
| `fastapi/services/project_kernel.py` | Kernel + InMemory/Firestore stores |
| `fastapi/routers/studio_projects_router.py` | `/api/studio/v1/projects/*` |
| `fastapi/models/export_request.py` | `project_id` + `project_revision` |
| `fastapi/main.py` | Router wired |
| `fastapi/tests/test_project_kernel.py` | 12 unit tests |

### Frontend (flagged)
| File | Role |
|------|------|
| `frontend/src/lib/studio/projectKernel.ts` | HTTP client |
| `frontend/src/hooks/useStudioProjectKernel.ts` | Projector hook |
| `frontend/src/stores/editorStore.ts` | Kernel projector fields |
| `frontend/src/types/export.ts` + `useServerExport.ts` | Export pin fields |

### Flags
- Backend: `STUDIO_PROJECT_KERNEL` (default on; `0`/`false` → 503)
- Frontend: `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1` to activate (default off = zero behavior change)

## Behavior verified
- Strategy A proposed_manifest required for mutate_project caps
- Non-event caps rejected (E2)
- Emit gate for chat/orchestrator (EP-001)
- OCC conflict + missing events
- Idempotent command_id
- Undo/redo via revert_to_revision + snapshot chain
- Soft-delete blocks commands
- import_adk_segments → import_assets alias
- Legacy ExportRequest without project fields still valid

## Explicitly not in this ship
- Full AI edit path auto-commit to Kernel (hook ready; wire in EP-004 / chat UI)
- Python Manifest reducer (Strategy B)
- EP-003 MediaGraph
- Cutover deleting legacy `Projects`
- Worker bake from Kernel revision (schema ready; worker consumption later)

## Validation
- `pytest tests/test_project_kernel.py` → 12 passed
- `py_compile` on kernel modules → clean
- FE: `npx tsc --noEmit` (run in verification)
