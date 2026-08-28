# Edit Contract / State-Mutation Path Audit

Question: does every path that can mutate project or timeline state produce a
structured record (finding, proposed change, expected result, risk,
reversibility, validation status), and does it pass through validated
capabilities rather than letting a model write state directly?

## Headline: the architecture holds. No bypass found.

**VERIFIED** — every project/timeline mutation in the backend funnels through
exactly one chokepoint, `ProjectKernel.accept_command`
(`services/project_kernel.py:496`). Exhaustive call-site enumeration:

```
routers/studio_projects_router.py:134   apply command  (source="ui_direct")
routers/studio_projects_router.py:161   undo           (system_op="undo")
routers/studio_projects_router.py:185   redo           (system_op="redo")
services/orchestrator_service.py:665    plan execution (source="orchestrator")
```

No other module calls it, and `apply_command_transaction` (the only code that
writes timeline state to Firestore) is reachable only from inside the kernel.
**No LLM code path writes state directly.** The reasoning/execution boundary
is intact.

Every mutation carries provenance on `ProjectCommand`: `command_id`,
`base_revision` (optimistic concurrency), `actor_session_id`, `source`,
`base_snapshot_hash`, and optionally `plan_id` + `intent`.

## Path-by-path compliance

| Path | Entry | Structured record | Verdict |
|---|---|---|---|
| Orchestrator plan execution | `orchestrator_service` | `plan_id` + `intent` + per-step status/`reject_reason`; steps validated against Capability Registry; `proposed_manifest` required for affecting steps | **COMPLIES** |
| Chat / director loop | `director_loop` → `decision_service` | Full `DecisionRecord` (evidence, rationale, candidate actions, verification plan, prediction) | **COMPLIES (proposal side)** |
| Direct UI command | `studio_projects_router` apply | `ProjectCommand` provenance only — no `DecisionRecord` | **PARTIAL — by design** |
| Undo / redo | `studio_projects_router` | `system_op`, event-sourced | **COMPLIES** |

### `DecisionRecord` field coverage vs. the contract

`models/studio_decision.py:96` — present: `evidence[]` (finding),
`candidate_actions[]` (proposed change), `rationale` (why), `prediction`
(expected result), `verification_plan` (validation), `status`,
`missing_information`, `plan_id`, `actor`, `gemini_called`, `credits_charged`.

`decision_service._assert_no_inference_as_fact` enforces that inference is not
recorded as observed fact — that is a real guard against the "subjective
judgment presented as objective" failure mode.

**GAP — no explicit `risk` or `reversibility` field.** The operating contract
names both. Reversibility is *structurally* true (event-sourced kernel with
undo/redo) and risk is *implicit* in `DecisionMode` + capability metadata, but
neither is a first-class, queryable field on `DecisionRecord`. A reviewer
cannot filter "show me all destructive decisions."

### Direct UI commands carry no DecisionRecord

Assessed as **correct, not a defect**: a human dragging a clip *is* the intent;
there is no AI finding to justify and no proposal to approve. The contract's
record requirement is about *AI-driven* actions. Provenance and reversibility
are still captured via the kernel. Flagging only so the asymmetry is a
deliberate, documented decision rather than an accident.

## Findings (no code change in this PR)

- **E-1 (MEDIUM)** — Add explicit `risk: RiskClass` and
  `reversibility: ReversibilityClass` to `DecisionRecord`. Both are already
  derivable; making them first-class is what enables the approval gate for
  destructive operations to be enforced by data rather than convention.
- **E-2 (LOW)** — `decision_store` swallows persistence failures at
  `debug`/`warning` level (`decision_store_put_failed`). A decision that was
  acted on but never persisted breaks the audit trail silently. Should be at
  least `warning` with a metric.
- **E-3 (INFO)** — `DecisionRecord.status` and the kernel's `CommandAck`
  are not cross-linked: given a decision you cannot cheaply find the resulting
  command/events. `plan_id` bridges the orchestrator path only.

## Conclusion

This subsystem does **not** need rebuilding. The contract is real, enforced at
a single chokepoint, and the reasoning/execution separation is genuinely
implemented rather than aspirational. The gaps are additive schema work
(E-1) and observability (E-2), both safely deferrable to their own PR.
