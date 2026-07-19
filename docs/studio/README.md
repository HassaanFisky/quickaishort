# QuickAI Studio — Documentation Platform

**Status:** Architecture audit complete (2026-07-18)  
**Scope:** Repository evidence → Vision alignment → Implementation blueprint  
**Audience:** AntiGravity agents, Principal engineers, Hassaan (founder)  
**Rule:** Treat every claim outside `docs/studio/27-validation-report.md` as needing re-verification against code before shipping.

---

## How to use this platform

1. Start at [00 — Executive Overview](./00-executive-overview.md)
2. Read [01 — Product Vision](./01-product-vision.md) (target state)
3. Read [27 — Validation Report](./27-validation-report.md) (what is FACT vs outdated doc)
4. Read [28 — Implementation Blueprint](./28-implementation-blueprint.md) (executable tasks)
5. Dive into subsystem docs as needed

**Docs-as-Code contract:** Every page cites repository file paths. Unverified claims are marked `Insufficient evidence.`

---

## Document map

| # | Document | Purpose |
|---|----------|---------|
| 00 | [Executive Overview](./00-executive-overview.md) | Verdict in one page |
| 01 | [Product Vision](./01-product-vision.md) | QuickAI Studio source of truth |
| 02 | [Repository Walkthrough](./02-repository-walkthrough.md) | Folder map + entry points |
| 03 | [Architecture](./03-architecture.md) | C4-style current vs target |
| 04 | [Backend](./04-backend.md) | FastAPI surface + services |
| 05 | [Frontend](./05-frontend.md) | Next.js editor + chat UX |
| 06 | [AI Architecture](./06-ai-architecture.md) | Orchestration reality vs vision |
| 07 | [Agent Architecture](./07-agent-architecture.md) | ADK agents + scaffolds |
| 08 | [Media Pipeline](./08-media-pipeline.md) | Ingest, Whisper, acquisition |
| 09 | [Rendering Pipeline](./09-rendering-pipeline.md) | RQ worker + ffmpeg + manifest |
| 10 | [Infrastructure](./10-infrastructure.md) | GCP, Redis, storage matrix |
| 11 | [Security](./11-security.md) | AuthZ, secrets, gaps |
| 12 | [Deployment](./12-deployment.md) | Cloud Run, Vercel, CI |
| 13 | [Operations](./13-operations.md) | Day-2 ops |
| 14 | [Monitoring](./14-monitoring.md) | Health, Sentry, DLQ |
| 15 | [Production Readiness](./15-production-readiness.md) | Go/no-go gates |
| 16 | [Technical Debt](./16-technical-debt.md) | Prioritized debt register |
| 17 | [Roadmap](./17-roadmap.md) | Phased Studio evolution |
| 18 | [Migration Strategy](./18-migration-strategy.md) | Evolve, do not rewrite |
| 19 | [Developer Guides](./19-developer-guides.md) | Onboarding for contributors |
| 20 | [API Reference](./20-api-reference.md) | Verified endpoints |
| 21 | [Data Flows](./21-data-flows.md) | End-to-end flows |
| 22 | [Component Diagrams](./22-component-diagrams.md) | Mermaid C4/container |
| 23 | [Sequence Diagrams](./23-sequence-diagrams.md) | Critical sequences |
| 24 | [Operational Playbooks](./24-operational-playbooks.md) | Incident runbooks |
| 25 | [Troubleshooting](./25-troubleshooting.md) | Symptom → fix |
| 26 | [Maintenance Guide](./26-maintenance.md) | Keep docs + deps healthy |
| 27 | [Validation Report](./27-validation-report.md) | Doc drift vs code |
| 28 | [Implementation Blueprint](./28-implementation-blueprint.md) | AntiGravity task pack |
| 29 | [Cost & OSS Policy](./29-cost-and-oss-policy.md) | Cost + license rules |
| 30 | [Documentation Engineering](./30-documentation-engineering.md) | How this platform stays true |

### ADRs

| ADR | Title |
|-----|-------|
| [001](./adrs/ADR-001-client-side-nle-execution.md) | Client-side NLE action execution |
| [002](./adrs/ADR-002-gcs-primary-storage.md) | GCS primary media storage |
| [003](./adrs/ADR-003-nextauth-jwt-auth.md) | NextAuth JWT as backend auth |
| [004](./adrs/ADR-004-render-manifest-evolution.md) | RenderManifest as NLE contract |
| [005](./adrs/ADR-005-chat-primary-ux.md) | Chat-primary editor UX |
| [006](./adrs/ADR-006-prompt-json-vs-native-tools.md) | Prompt-JSON tools vs native function calling |

---

## Legacy docs (hypothesis until validated)

Existing root/`docs/` files are **not deleted**. They are classified in [27 — Validation Report](./27-validation-report.md). Prefer this `docs/studio/` tree for Studio work.

---

## Engineering packages (active delivery)

| Package | Status | Path |
|---------|--------|------|
| EP-001 Capability Registry ABI | FROZEN — production progression approved | [packages/EP-001-capability-registry-abi.md](./packages/EP-001-capability-registry-abi.md) · [Report](./packages/EP-001-IMPLEMENTATION-REPORT.md) · [Final Gate](./packages/EP-001-FINAL-VERIFICATION-GATE.md) |
| EP-002 Project Document Kernel | DESIGN COMPLETE — await approval (no code) | [packages/EP-002-server-authoritative-project-document.md](./packages/EP-002-server-authoritative-project-document.md) |
| Phase 2 Truth Review | LOCKED | [PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md](./PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md) |

Contracts seeded: `docs/studio/contracts/` + runtime copies under `fastapi/capabilities/`.

---

## Quick verdict

**Today:** YouTube→Shorts SaaS with AI *suggestion* JSON + browser Zustand NLE + server ffmpeg export + ADK Pre-Flight.  
**Target:** AI-native professional editor where conversation is primary and AI *executes real tools* with orchestration.  
**Strategy:** Evolve existing `ai_editor` + `editorStore.dispatchAIActions` / `applyAiEdits` + `RenderManifest` — do **not** rewrite the product.
