# Canonical Project Memory

**Last rebuilt:** 2026-08-25 (typed-chat director loop)  
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
- Ingest lifecycle: staged FSM via `useIngestLifecycle` (`identify→…→ready|failed`); contract `services/ingest_fsm.py`  
- Onboarding: `GET/PUT /api/studio/v1/me/onboarding`  
- Editor: `IngestSurface` (Upload ≡ URL), lazy onboarding tour  
- **ADK UI:** `/adk` Google Agent Development Kit — **Coming Soon** + reserved IA skeleton (not Ads, not a live wizard)  
- FE Kernel flag: `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1`  
- Media storage: **GCS primary**; GridFS legacy `/api/v1/video/*` only  

## Non-negotiables

Never bypass EP-001. Never second source of truth for capabilities. Never hidden state. Never weaken deterministic replay / audit / observability. Suggestions = MediaGraph only. Never document Coming Soon ADK UI as shipped.

Typed chat for dead-air / shorts packaging / restore-opening is Decision Intelligence first (0 Gemini). DualModelRouter remains the path for unrelated/creative commands.


## Cross-session product and business direction (reviewed 2026-11-20)

Read root AI_CONTEXT.md at the start of every non-trivial session. Detailed founder requirements are now maintained in documents 42–45:
- 42: global product, chat-first multimodal editing, logical agent domains, bounded autonomy and privacy-respecting Behavioral Intelligence.
- 43: finance control plane, provider-event durability, separate product credits and cash ledger, reconciliation, unit economics and owner-approved payouts.
- 44: security, data privacy, tenant isolation, prompt-injection defenses, abuse controls and incident response.
- 45: common memory, source-of-truth order, local worktree integrity, verification and change governance.

### GitHub snapshot verified 2026-11-20 (not a live production audit)

- Repository HassaanFisky/quickaishort, default branch main, visibility PUBLIC.
- Inspected HEAD bb6aa32d31482c7010ec8574220abf1089d9a226; visible latest commit date 2026-11-09.
- The nine domains in document 42 are a target role map. Current agent scaffold documentation records five principal technical roles.
- fastapi/routers/billing.py has Paddle, Stripe and LemonSqueezy webhook routes; frontend/src/lib/billing-plans.ts is Paddle-oriented. These facts do not prove all provider onboarding or checkout configurations are live, or that a double-entry finance ledger, settlement reconciler or payout system exists.
- Short-form dubbing path is documented; movie-length dubbing remains deferred by ADR-015.
- docs/studio/11-security.md last records a code-grounded review dated 2026-08-01 and still contains watch-list items. This update does not close them.
- No cloud IAM, live provider dashboard, live checkout, live AI call, deployment, or penetration test was verified.

Do not commit secrets, customer files, private financial instructions, bank/payee details or confidential partner terms. This repository was public during inspection.
