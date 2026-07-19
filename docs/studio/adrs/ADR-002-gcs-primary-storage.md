# ADR-002 — GCS as Primary Media Storage

- **Status:** Accepted  
- **Date:** 2026-07-18  

## Context

Historical docs oscillated between GridFS-primary and GCS-primary narratives.

## Decision

**GCS bucket `quickaishort-agent-494304-media` is primary** for ADK uploads, editor uploads, exports, TTS cache. Mongo GridFS remains **legacy-only** for `/api/v1/video/*`.

## Consequences

- Fix any `gridfs://` labels on GCS objects  
- Do not build new features on GridFS  
- Deprecate v1 video API after traffic proof  

## Evidence

`fastapi/services/db.py`, `main.py` ADK upload/export paths, `services/storage.py` legacy
