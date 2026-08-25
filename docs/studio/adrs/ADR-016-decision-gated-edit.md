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

**Still out of scope (honest):** unrelated/creative typed chat still DualModelRouter; Kernel commit on that path remains ungated `structured_steps`; director typed chat now uses `decision_gate`; Tier 1 media outcome observation; Pre-Flight brain; live Gemini; learning/refinement loop.

Original M0 in-repo scope: contracts + deterministic `resolve_objective` + unit tests. Orchestrator HTTP wiring and Tier 0 execute checks were follow-on milestones on the same ADR, not a parallel ABI.

Out of scope: Pre-Flight integration, new agents, semantic pacing, learning/calibration, live Gemini.

## Remaining work (complete inventory — 2026-08-25)

Grounded in repo evidence. This ADR does **not** claim the Studio vision is complete.

### A — Shipped

- M0 Decision Intelligence: `models/studio_decision.py`, `services/decision_service.py`
- Orchestrator `decision_gate` + Tier 0 Kernel event verify (REMOVE_SILENCES)
- FE `decision_gate` for MediaGraph REMOVE_SILENCES chips
- **Typed-chat director loop (2026-08-25):** `director_loop.py` intercepts dead-air / shorts-packaging / restore-opening **before** DualModelRouter and **before** credit charge. Compound ACT uses existing emit-allowed capabilities only (`REMOVE_SILENCES`, `TOGGLE_CAPTIONS`, `TRIM`, `ADD_CAPTION`). Unresolved clauses stay ASK. Follow-up “keep the original opening” revises the last DecisionRecord / marks instead of a second unrelated plan. Redis `decision_store` latest-per-project. 0 Gemini on this path.
- RenderManifest now encodes trim/marks as clip windows and burns captions in `manifest_renderer` when present.

### B — Safe in-repo follow-ons

- Tier 1 media outcome observation (post-cut silence re-measure)
- Server-owned snapshot of intended segments if Redis plan TTL expiry becomes a product issue

### C — Still residual

- Public `/api/proxy*`, `/api/audio`, `/api/info` rate-limit/auth (founder)
- GCS public ACL live check (founder)
- CSP report-only → enforce
- `AUTO_REFRAME` remains emit=false / preview `not_implemented` — speaker reframe is honest ASK

### D — Blocked on founder / credits / deploy / live

- Gemini prepayment top-up → live `generateContent` smoke
- Deploy API + FE revision that includes this branch
- `GOOGLE_TTS_API_KEY` for full Dub Video voice
- Rotate `ADMIN_SECRET`

### E — Out of scope until later ADRs

- ADR-006 native FunctionDeclaration as the default planner (canary remains flag-gated)
- Multiplayer (EP-007)
- Movie-length dub
- New LLM provider / Pre-Flight as the brain
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
