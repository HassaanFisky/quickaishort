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
5. **Verification owns execution/result integrity.** Completing a plan, HTTP 200, or creating a file is **not** proof the objective succeeded. Tier 0: step acceptance + Kernel `event_ids` + execute-time MediaGraph segment re-verify (shipped); Tier 1+ media outcome observation remains future work.
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
| F Execute evidence re-verify | `5d60fdc` | Gated ACT `REMOVE_SILENCES` segments re-checked against MediaGraph at execute |

**Still out of scope (honest):** frontend chat `decision_gate` wiring, post-execute media outcome verification (Tier 1+), Pre-Flight brain, live Gemini, learning/refinement loop.

Original M0 in-repo scope: contracts + deterministic `resolve_objective` + unit tests. Orchestrator HTTP wiring and Tier 0 execute checks were follow-on milestones on the same ADR, not a parallel ABI.

Out of scope: Pre-Flight integration, new agents, semantic pacing, learning/calibration, live Gemini.

## Consequences

- Chat can later sit behind a DecisionRecord without rewriting Kernel / Registry / Orchestrator.
- Cost: dead-air ACT/ASK/RESEARCH in this service never calls Gemini.
- Honesty: missing silence cannot become a fabricated cut list.

## Non-goals

- Shorts-generator identity
- Making Pre-Flight the brain without a later ADR
- Second LLM provider
- New database, queue, or render system
