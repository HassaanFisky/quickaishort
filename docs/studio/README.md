# QuickAI Studio — Documentation Platform

**Status:** Synchronized with production product identity (2026-07-21)  
**Product today:** QuickAI Short  
**Platform evolution:** QuickAI Studio (same codebase — AI-native editing OS direction)  
**Audience:** Engineers, agents, founder  
**Rule:** Claims outside verified code + this tree need re-check before shipping. Prefer [`27-validation-report.md`](./27-validation-report.md) for historical drift notes.

---

## How to use this platform

1. [00 — Executive Overview](./00-executive-overview.md)  
2. [01 — Product Vision](./01-product-vision.md)  
3. [PHASE2 — Architectural Truth Review](./PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md) (**binding OS law**)  
4. [Canonical Project Memory](./CANONICAL_PROJECT_MEMORY.md)  
5. [ROADMAP](./ROADMAP.md) · [MIGRATION_STATUS](./MIGRATION_STATUS.md)  
6. Subsystem docs (02–30) and ADRs / EPs as needed  

**Docs-as-Code:** Cite repository paths. Mark unverified claims. Separate **production** from **roadmap**.

---

## Document map

| # | Document | Purpose |
|---|----------|---------|
| 00 | [Executive Overview](./00-executive-overview.md) | Verdict in one page |
| 01 | [Product Vision](./01-product-vision.md) | Short → Studio identity |
| 02 | [Repository Walkthrough](./02-repository-walkthrough.md) | Folder map |
| 03 | [Architecture](./03-architecture.md) | Current vs target |
| 04 | [Backend](./04-backend.md) | FastAPI surface |
| 05 | [Frontend](./05-frontend.md) | Editor + chat UX |
| 06 | [AI Architecture](./06-ai-architecture.md) | Orchestration reality |
| 07 | [Agent Architecture](./07-agent-architecture.md) | ADK agents |
| 08 | [Media Pipeline](./08-media-pipeline.md) | Ingest / Whisper |
| 09 | [Rendering Pipeline](./09-rendering-pipeline.md) | RQ + ffmpeg |
| 10 | [Infrastructure](./10-infrastructure.md) | GCP / Redis / storage |
| 11 | [Security](./11-security.md) | AuthZ / secrets |
| 12 | [Deployment](./12-deployment.md) | Cloud Run / Vercel |
| 13–16 | Ops, monitoring, readiness, debt | Day-2 + registers |
| 17–18 | [Roadmap](./17-roadmap.md) · [Migration](./18-migration-strategy.md) | Evolution plan |
| 19–25 | Guides, API, flows, diagrams, playbooks | Reference |
| 26–30 | Maintenance, validation, blueprint, cost, doc engineering | Governance |

Also: [ARCHITECTURE_DECISION_LOG](./ARCHITECTURE_DECISION_LOG.md) · [TECHNICAL_DEBT_REGISTER](./TECHNICAL_DEBT_REGISTER.md)

### ADRs (accepted / binding)

| ADR | Title |
|-----|-------|
| [001](./adrs/ADR-001-client-side-nle-execution.md) | Client NLE = preview; authority → Project Document |
| [002](./adrs/ADR-002-gcs-primary-storage.md) | GCS primary media |
| [003](./adrs/ADR-003-nextauth-jwt-auth.md) | NextAuth JWT backend auth |
| [004](./adrs/ADR-004-render-manifest-evolution.md) | RenderManifest bake contract |
| [005](./adrs/ADR-005-chat-primary-ux.md) | Chat-primary UX direction |
| [006](./adrs/ADR-006-prompt-json-vs-native-tools.md) | Prompt-JSON → native tools path |
| [007](./adrs/ADR-007-capability-registry-abi.md) | Capability Registry ABI |
| [008](./adrs/ADR-008-server-authoritative-project-document.md) | Project Document Kernel |
| [009](./adrs/ADR-009-mediagraph-grounded-suggestions.md) | MediaGraph-only suggestions |
| [010](./adrs/ADR-010-orchestrator-plan-jobs.md) | Orchestrator plan jobs |
| [011](./adrs/ADR-011-chat-primary-shell.md) | Chat-primary shell |
| [012](./adrs/ADR-012-bake-from-kernel-snapshot.md) | Bake from Kernel snapshot |
| [013](./adrs/ADR-013-editor-ingest-onboarding-adk.md) | Ingest parity + ADK Coming Soon |

### Engineering packages

| Package | Status | Path |
|---------|--------|------|
| EP-001 Capability Registry ABI | **FROZEN** | [packages/EP-001-capability-registry-abi.md](./packages/EP-001-capability-registry-abi.md) |
| EP-002 Project Document Kernel | **IMPLEMENTED** | [packages/EP-002-server-authoritative-project-document.md](./packages/EP-002-server-authoritative-project-document.md) |
| EP-003 MediaGraph suggestions | **IMPLEMENTED** | [packages/EP-003-mediagraph-suggestion-engine.md](./packages/EP-003-mediagraph-suggestion-engine.md) |
| EP-004 Orchestrator plan jobs | **IMPLEMENTED** | [packages/EP-004-orchestrator-plan-jobs.md](./packages/EP-004-orchestrator-plan-jobs.md) |
| EP-005 Chat-primary shell | **IMPLEMENTED** | [packages/EP-005-chat-primary-shell.md](./packages/EP-005-chat-primary-shell.md) |
| EP-006 Manifest bake Kernel | **IMPLEMENTED** | [packages/EP-006-manifest-bake-kernel.md](./packages/EP-006-manifest-bake-kernel.md) |
| EP-007 Workflows / collab | Design-locked | [packages/EP-007-workflows-collab-readiness.md](./packages/EP-007-workflows-collab-readiness.md) |
| EP-008 First-run + ADK CS | **IMPLEMENTED** | [packages/EP-008-editor-first-run-product-surface.md](./packages/EP-008-editor-first-run-product-surface.md) |
| Phase 2 Truth Review | **LOCKED** | [PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md](./PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md) |

Contracts: `docs/studio/contracts/` + runtime `fastapi/capabilities/`.

---

## Quick verdict

| Horizon | Reality |
|---------|---------|
| **Today (QuickAI Short)** | Conversational AI editor · MediaGraph suggestions · Zustand preview NLE · RQ/GCS export · Pre-Flight ADK skill · Studio Kernel dual-run |
| **Next (QuickAI Studio)** | Deeper tool orchestration · richer analysis · ADK workspace release when ready |
| **Strategy** | Evolve — do not rewrite. Never bypass EP-001. |

**ADK UI (`/adk`):** Coming Soon — blurred — not available. Google Agent Development Kit ≠ advertisements.

---

## Legacy root docs

Root `README.md`, `ARCHITECTURE.md`, and `VISION.md` were realigned 2026-07-21 to this identity. Older ops snapshots under `docs/` remain historical unless noted. Prefer this tree for architecture decisions.
