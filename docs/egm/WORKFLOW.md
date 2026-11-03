# QuickAI Studio — EGM Operational Workflow Guide

**Authority:** QuickAI Studio Engineering Directorate  
**Standard:** Google Elephant-Goldfish Model (EGM) Integration  
**Applies to:** Antigravity Agents, Peer Reviewers, and Human Engineers  

---

## 1. The EGM Lifecycle in QuickAI Studio

```
[ Elephant Session ] ────► Draft Spec ────► [ Goldfish Swarm ] ────► Synthesis & Resolution
  (Long Horizon Context)     (Targeted)     (Zero-Context Reviewers)      (Approved Spec)
                                                     │
                                                     ▼
                                        Executable Implementation
                                                     │
                                                     ▼
                                         Specification-to-Code
                                              Drift Check
```

### Stage 1: The Elephant (Context & Specification)
* **Role:** Long-horizon engineering session retaining deep project memory, architecture contracts, and accepted ADRs.
* **Source of Truth:** [`docs/egm/ELEPHANT_CONTEXT.md`](./ELEPHANT_CONTEXT.md) and [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
* **Output:** A self-contained, unambiguous Markdown specification stored in `docs/egm/specs/{SPEC_NAME}.md`.
* **Standard:** Follows the 8-point Spec Structure (Goals, Non-Goals, Architectural Constraints, Data Models, API Contracts, Failure Modes, Test Plan, Acceptance Criteria).

### Stage 2: The Goldfish (Fresh-Context Independent Criticism)
* **Role:** Independent review subagents invoked with **zero conversation context** to expose blind spots, missing edge cases, and unwarranted assumptions.
* **Standard Subagent Swarm Personas (Google EGM Standard):**
  1. `egm-design`: Hostile Design Critic (system architecture, scalability, latency, fail-closed boundaries).
  2. `egm-codebase-details`: Pedantic Quality Auditor (codebase fidelity, existing library reuse, data model accuracy).
  3. `egm-implementation-readiness`: Pragmatic Tech Lead (unambiguous, actionable instructions without implementer guesswork).
  4. `egm-comprehension`: Naive Reader (undefined terms, acronyms, mental leap detection).
  5. `egm-structural`: Document Architect (hierarchy, formatting, template completeness).
  6. `egm-style`: Technical Copy Editor (clarity, precision, active voice, brevity).
  7. `egm-zoom-out`: Skeptical Minimalist Architect (YAGNI, scope containment, simplicity).
  8. `egm-synthesizer`: Swarm Compiler (aggregates findings, deduplicates issues, outputs prioritized actionable verdict).
* **Storage:** Review logs and verdicts are recorded in `docs/egm/reviews/{SPEC_NAME}_REVIEW.md`.

### Stage 3: Resolution & Implementation
* The Elephant reviews the synthesized Goldfish findings, updates the spec, resolves trade-offs with the human director, and executes the implementation with targeted edits.

### Stage 4: Specification-to-Code Drift Verification
* Using `egm-drift-report`, the codebase is periodically audited against landed design documents in `docs/egm/specs/` to detect unfulfilled contracts or architectural divergence.

---

## 2. Practical Rules for Antigravity Quota Discipline
1. **Never run unbounded swarms for minor tasks:** Use the full 7-persona Goldfish swarm only for critical architectural modifications (e.g. data schema migrations, auth overhauls, video pipeline redesigns).
2. **Targeted Subagent Reviews:** For routine feature additions, invoke only `egm-design` and `egm-codebase-details`.
3. **Preserve Workspace Hygiene:** All transient scratch notes stay in memory or local scratch; only approved engineering artifacts are committed to `docs/egm/`.
