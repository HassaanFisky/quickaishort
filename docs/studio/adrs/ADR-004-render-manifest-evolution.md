# ADR-004 — RenderManifest as Export Contract

- **Status:** Accepted (evolve coverage)  
- **Date:** 2026-07-18  

## Context

Export historically used flat `ExportRequest` option bags. A parallel `RenderManifest` schema exists on FE and BE with partial worker compile support.

## Decision

**RenderManifest is the long-term contract** between interactive timeline and ffmpeg bake. New export fidelity features extend Manifest + `manifest_renderer`, not new ad-hoc fields without schema.

## Consequences

- Invest in `compile_manifest_to_ffmpeg` tests  
- FE always attach manifest on complex timelines  
- Flat ExportRequest remains compatibility layer during transition  

## Evidence

`fastapi/models/render_manifest.py`, `services/manifest_renderer.py`, `render_worker.py`, `frontend/src/lib/render/renderManifest.ts`
