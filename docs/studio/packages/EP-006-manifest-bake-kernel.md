# EP-006 — Manifest Bake from Project Kernel

**Status:** APPROVED FOR IMPLEMENTATION  
**Priority:** P0 — Part G step 6  
**Depends on:** EP-002, ADR-004  

## Decision

When `ExportRequest.project_id` is set, bake IR is the Kernel snapshot at `project_revision` (default head). Client `render_manifest` is ignored for authority (may still be accepted for legacy).

Legacy exports without `project_id` unchanged.
