# Canonical Project Memory

**Last rebuilt:** 2026-07-21 (documentation synchronization pass)  
**Authority:** Latest accepted EPs / ADRs / founder decisions only

## Product

| Name | Role |
|------|------|
| **QuickAI Short** | Production product — conversational AI video editing |
| **QuickAI Studio** | Evolution of QuickAI Short into an AI-native editing OS |

Editor is the product surface. AI performs edits via tools. Chat-primary UX direction (Phase 2). Timeline visualizes decisions.

## Frozen / Accepted

| Artifact | Status |
|----------|--------|
| EP-001 Capability Registry ABI | **FROZEN** |
| ADR-007 Capability Registry | Accepted |
| EP-002 Project Document + Errata E1–E5 | **IMPLEMENTED** |
| ADR-008 Server-Authoritative Project Document | Accepted |
| EP-003 MediaGraph + Grounded Suggestions | **IMPLEMENTED** |
| ADR-009 MediaGraph + Grounded Suggestions | Accepted |
| EP-004 Orchestrator Plan Jobs | **IMPLEMENTED** |
| ADR-010 Orchestrator Plan Jobs | Accepted |
| EP-005 Chat-Primary Shell | **IMPLEMENTED** |
| ADR-011 Chat-Primary Shell | Accepted |
| EP-006 Manifest Bake from Kernel | **IMPLEMENTED** |
| ADR-012 Bake from Kernel Snapshot | Accepted |
| EP-007 Workflows/Collab readiness | Design-locked (no multiplayer) |
| EP-008 Editor First-Run Product Surface | **IMPLEMENTED** |
| ADR-013 Ingest / Onboarding / ADK CS | **Accepted** (ADK ≠ Ads) |
| Phase 2 Architectural Truth Review | **Binding OS direction** |
| Cost-efficient architecture policy | Binding (`.cursor/rules/cost-efficient-architecture.mdc`) |
| Principal engineering ownership policy | Binding (`.cursor/rules/principal-engineering-ownership.mdc`) |

## Runtime truth (verified)

- Studio Kernel: `/api/studio/v1/projects`  
- MediaGraph: `/api/studio/v1/media-graphs`  
- Orchestrator: `/api/studio/v1/orchestrator`  
- Ingest policy: `GET /api/studio/v1/ingest/policy` (not EP-001)  
- Onboarding: `GET/PUT /api/studio/v1/me/onboarding`  
- Editor: `IngestSurface` (Upload ≡ URL), lazy onboarding tour  
- **ADK UI:** `/adk` Google Agent Development Kit — **Coming Soon** + reserved IA skeleton (not Ads, not a live wizard)  
- FE Kernel flag: `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1`  
- Media storage: **GCS primary**; GridFS legacy `/api/v1/video/*` only  

## Non-negotiables

Never bypass EP-001. Never second source of truth for capabilities. Never hidden state. Never weaken deterministic replay / audit / observability. Suggestions = MediaGraph only. Never document Coming Soon ADK UI as shipped.
