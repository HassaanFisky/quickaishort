# ADR-016 — Decision-Gated Edit (M0)

- **Status:** Accepted
- **Date:** 2026-08-20
- **Relates:** ADR-008 (Project Document), ADR-009 (MediaGraph), ADR-010 (Orchestrator), ADR-007 (Capability Registry)
- **Does not supersede:** Phase 2 D5 / ADR-015 — Pre-Flight remains an **optional specialist skill**, not the product brain

## Context

Studio Kernel already has four load-bearing contracts:

| Contract | Owns |
|----------|------|
| Capability Registry (EP-001) | Allowed tools |
| Project Kernel (EP-002) | Authoritative execution / state transitions |
| MediaGraph (EP-003) | Project/media observations |
| Orchestrator (EP-004) | How a structured plan executes |

The live chat path is still `USER → Gemini JSON actions → preview → optional Kernel plan`. That path does not distinguish evidence kinds, does not decide ACT / ASK / RESEARCH / SIMULATE / DEFER / NOTHING before planning, and treats Kernel acknowledgement as if the creative objective succeeded.

M0 needs the smallest Decision Intelligence layer that can gate a meaningful edit **without** a parallel architecture, second tool ABI, new queue, new render plane, or second LLM.

## Decision

1. **Decision Intelligence decides WHAT should happen and WHY.** It emits a `DecisionRecord` before any new Orchestrator plan is considered authorized for the gated path.
2. **Orchestrator owns HOW.** M0 does not replace `create_plan` / `execute_plan`. It does not create plans when the mode is not ACT.
3. **Registry owns capabilities.** M0 does not add registry rows. The first deterministic ACT uses existing `REMOVE_SILENCES`.
4. **Kernel owns authoritative execution.** M0 does not write a second project-state system.
5. **Verification owns execution/result integrity.** Completing a plan, HTTP 200, Kernel ack, or creating a file is **not** proof the objective succeeded. Tier 0 (shipped on this branch): step acceptance + Kernel `event_ids` + execute-time MediaGraph segment re-verify + **post-execute Kernel event readback vs intended CandidateAction**. Client `proposed_manifest` is never treated as proof dead-air is gone. Tier 1+ media outcome observation (post-cut silence re-measure) remains future work.
6. **Pre-Flight stays optional.** Do not invoke `run_preflight_pipeline` from the decision service. Audience simulation is a specialist, not the mandatory brain.
7. **Deterministic first.** If MediaGraph already has usable silence evidence and the objective is dead-air / pacing, decide ACT with 0 Gemini calls and 0 AI credits. If silence evidence is missing or unavailable, ASK or RESEARCH, represent UNCERTAINTY, and do not invent gaps or analytics.
8. **Evidence kinds stay distinguishable.** Never store `MODEL_INFERENCE` as `VERIFIED_FACT`. Never treat missing evidence as zero.

## M0 scope (this ADR)

**Shipped on branch `hasaaanfisky/m0-decision-gated-edit-f78a` (2026-08-20):**

| Milestone | Commit | What |
|-----------|--------|------|
| M0 contracts + `resolve_objective` | `75905cf` | `DecisionRecord`, deterministic dead-air ACT/ASK/RESEARCH; 0 Gemini |
| B+C Orchestrator wiring | `1c76353` | `decision_gate` → gated `create_plan` / ACT-only `execute_plan`; `execution_integrity` on Plan |
| D Router HTTP proof | `10ba9a7` | JWT + `decision_gate` over `/api/studio/v1/orchestrator/*` |
| E Tier 0 event binding | `64acb9e` | Gated mutating steps require Kernel `event_ids` for `execution_ok` |
| F Execute evidence re-verify | prior on branch | Gated ACT `REMOVE_SILENCES` segments re-checked against MediaGraph at execute |
| G Post-execute Kernel event check | this branch | Intended CandidateAction vs tenant-checked Kernel events; missing ≠ match; client snapshot ≠ objective |

**Still out of scope (honest):** default typed `/editor` chat `decision_gate` (DualModelRouter); Kernel commit after chat remains ungated `structured_steps`; Tier 1 media outcome observation; Pre-Flight brain; live Gemini; learning/refinement loop.

Original M0 in-repo scope: contracts + deterministic `resolve_objective` + unit tests. Orchestrator HTTP wiring and Tier 0 execute checks were follow-on milestones on the same ADR, not a parallel ABI.

Out of scope: Pre-Flight integration, new agents, semantic pacing, learning/calibration, live Gemini.

## Remaining work (complete inventory — 2026-08-20)

Grounded in repo evidence. This ADR does **not** claim the Studio vision is complete.

### A — Shipped (this branch, not merged to `main`)

- M0 Decision Intelligence: `models/studio_decision.py`, `services/decision_service.py`, `tests/test_decision_gate.py`
- Phase B: optional `decision_id` / `decision_mode` on Plan; `decision_gate`; gated `create_plan` uses `resolve_objective`; client `decision_mode` ignored; only ACT creates executable steps; ASK/RESEARCH/NOTHING = 0-step draft; execute refuses non-ACT gated
- Phase C: `ExecutionIntegrity` never `objective_verified`
- Phase D: `tests/test_orchestrator_router.py` JWT + `decision_gate` HTTP
- Phase E: gated ACT mutating accepted without `event_ids` → cannot claim `execution_ok`
- Phase F: execute-time MediaGraph segment re-verify (`verify_remove_silences_params_against_graph`)
- Phase G: post-execute Kernel event readback (`candidate_matches_project_event`); gated `project_id` bind; terminal execute idempotency
- Registry frozen (`REMOVE_SILENCES` only for deterministic ACT). Pre-Flight not called from `decision_service`.

### B — Safe in-repo follow-ons (not this change)

- **Shipped (same product branch, 2026-08-22):** FE `decision_gate` for MediaGraph **REMOVE_SILENCES** chips only (`intent_text` = chip label). ASK/RESEARCH with chip `params.segments` falls back to the existing structured plan (still 0 Gemini). Typed `/editor` chat stays DualModelRouter.
- Persist `DecisionRecord` (today only ids/mode live on Plan). Additive store; not required for Tier 0 verify because candidate params are copied onto plan steps.
- Server-owned snapshot of intended segments at plan-create time if Redis plan TTL expiry becomes a product issue (`ORCH_PLAN_TTL_SEC`).

### C — Security residuals (watch; several closed this change)

- Closed here: gated execute `project_id` mismatch; terminal re-execute replay; Kernel event lookup is tenant-checked; `AUTH_DISABLED` cannot bypass JWT; `MOCK_AI_EDITOR` re-checked at request time in production.
- Still residual: public `/api/proxy*`, `/api/audio`, `/api/info` rate-limit/auth (founder); GCS public ACL live check (founder); CSP report-only → enforce (after console clean); `AUTH_DISABLED` leftover in `.env.example` / worker build import (documented unused).

### D — Blocked on founder / credits / deploy / live

- Gemini prepayment top-up → live `generateContent` smoke (analyze, AI chat, key rotate)
- Deploy this branch (API Cloud Run + Vercel FE) — **do not merge `main` from this ADR**
- SUPERSEDED (2026-08-22): empty `/editor` max-update-depth in `next dev` was `ServerExportHost` writing a new `cancelExport` into `serverExportStore` every render — not Radix `composeRefs`. Fixed with stable `useCallback` + no-op store writes. Backend `POST /api/ai-editor/command` under `MOCK_AI_MODE` remains the no-spend AI round-trip.
- `GOOGLE_TTS_API_KEY` for full Dub Video voice; Dub live smoke after Gemini + TTS
- Rotate `ADMIN_SECRET` (historical docs exposure)
- Live smoke of gated ACT on production Kernel + MediaGraph silence facet

### E — Out of scope until later ADRs

- ADR-006 native FunctionDeclaration (Phase 2)
- Multiplayer (EP-007)
- Movie-length (1–2hr) dub
- Image-native editing
- New LLM provider
- Learning / calibration / MEMORY expansion
- Extra agents; Pre-Flight as the brain
- Shorts-generator identity / clipper core
- New registry capabilities

### Founder still owns for global launch (not local-setup)

1. Top up Gemini credits and confirm `generateContent` 200
2. Deploy API + FE revision that includes this branch
3. Confirm prod `/docs` 404, `/metrics` admin-gated, GCS not public
4. Live smoke: ingest → (optional) gated dead-air ACT → honest `execution_integrity` → export
5. TTS key if Dub voice is in the launch cut

## Consequences

- Chat can later sit behind a DecisionRecord without rewriting Kernel / Registry / Orchestrator.
- Cost: dead-air ACT/ASK/RESEARCH in this service never calls Gemini.
- Honesty: missing silence cannot become a fabricated cut list.

## Non-goals

- Shorts-generator identity
- Making Pre-Flight the brain without a later ADR
- Second LLM provider
- New database, queue, or render system
