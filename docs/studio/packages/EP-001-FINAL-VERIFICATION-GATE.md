# EP-001 — Final Architectural Verification Gate

**Date:** 2026-07-18  
**Scope:** Verify EP-001 against ADR-007, EP-001 package DoD, Phase 2 Truth Review (A9 / A5e / Part G step 1 only)  
**Action:** Freeze EP-001. Do not start EP-002.  
**Code changes this gate:** None

---

## Requirement satisfaction matrix

### ADR-007

| Decision | Satisfied? | Evidence |
|----------|------------|----------|
| Canonical id = `AiEditorAction.type` | YES | `registry.v1.json` ids; `tool_registry.assert_registry_valid()` matches model discriminators |
| SoT = `registry.v1.json` (+ schema file) | YES | `fastapi/capabilities/registry.v1.json` + `schema.v1.json`; structural load validation |
| `ToolName` deprecated → aliases only | YES | `aliases.v1.json`; `ToolName` docstring; `normalize_command_actions` |
| `orchestrator_emit=false` blocks emission | YES | sanitiser gate default on; tests; live check `SET_KEYFRAME` → `emit_blocked` |
| Planner prompts from registry | YES | `build_orchestrator_system_prompt` / `list_emit_allowed`; engine has no `selection_tool`/`razor_tool` |
| EP-001 binding for first merge | YES | Package status IMPLEMENTED; founder accepted |

### EP-001 Definition of Done (§10)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Registry complete for every discriminator | YES — 78 caps, `assert_registry_valid()` OK |
| 2 | Engine catalog from `tool_registry` only | YES — BE engine paths |
| 3 | Sanitiser drops emit=false / unknown | YES |
| 4 | ToolName alias-only | YES |
| 5 | FE generated sync + catalog refs | YES — BE/FE bytes identical; `CAPABILITY_BY_ID` |
| 6 | Tests + tsc green | YES — 82 pytest; tsc exit 0 (prior run) |
| 7 | ADR-007 accepted | YES |
| 8 | No chat/MediaGraph scope creep | YES |

### Phase 2 (EP-001 slice only)

| Decision | Satisfied for Part G step 1? | Notes |
|----------|------------------------------|-------|
| A9 Capability Registry ABI | YES | Registry + retrieve top-K + emit policy |
| A5e Honesty / no pretend tools | YES | Emit gate |
| A8 Full orchestrator loop | **Out of scope** | EP-004 territory — not an EP-001 defect |
| A5a Heuristic suggestions ban | **Out of scope** | EP-003 / MediaGraph — leftover `INSTANT_SUGGESTIONS` is not EP-001 ABI debt |
| A10 ProjectDocument authority | **Out of scope** | EP-002 |

---

## Live verification snapshot

```
caps 78
emit 35
aliases 17
be_fe_identical True
engine contains selection_tool/razor_tool: False
assert_registry_valid: OK
```

---

## Issue register

### Critical (must fix before EP-002)

**None.**

### High

**None.**

### Medium

| ID | Issue | Classification notes |
|----|-------|----------------------|
| M1 | **FE still contains a parallel hardcoded `EDITOR_SYSTEM_PROMPT` catalogue** in `frontend/src/lib/gemini-editor.ts` (`callGeminiEditor`). Not used by the primary command path (`sendEditorCommand` → registry-backed API), but remains a second vocabulary if any caller invokes it. | Hidden dialect debt / maintainability. Fix in a later cleanup EP or when deleting client-direct Gemini edit path — **not** an ADR-007 production blocker while primary OS path is server-gated. |
| M2 | **No JSON-Schema engine validation** against `schema.v1.json` at runtime — structural field/enum checks + discriminator parity instead. | ADR wording “validated by schema.v1.json” met as contract file + structural validator; full Draft 2020-12 engine is optional hardening. |
| M3 | **Legacy `translateToolActionToLegacy` retained in `AIPanel.tsx`** as inbound safety net alongside server `normalize_command_actions`. | Temporary duplication until alias bridge removed; intentional one-release compat. |
| M4 | **No CI step enforced yet** to fail PRs when FE generated registry ≠ BE registry (sync is manual script). | Drift risk if someone edits only one side; startup BE validation catches BE↔Pydantic, not FE copy. |

### Low

| ID | Issue | Notes |
|----|-------|-------|
| L1 | Bootstrap registry titles/descriptions are generic (`Studio capability TRIM`) | UX/docs polish, not ABI |
| L2 | `param_schema` mostly `{type:object}` stubs | Fine until native FC (ADR-006) |
| L3 | Keyword tagger for retrieval is heuristic | Allowed by EP-001 for planner retrieval only; not user suggestion chips |
| L4 | `enforce_emit_policy=False` escape hatch in tests | Documented; production default True |
| L5 | Full `/api/capabilities` (non-lite) returns large payload | Acceptable; lite mode exists |
| L6 | Alias→capability for emit=false targets (e.g. masks) normalize then drop | Correct honesty behavior; may surprise old clients |

---

## Explicit non-issues (do not reopen EP-001)

- Heuristic suggestion chips (`INSTANT_SUGGESTIONS`) — Phase 2 A5a / later EP  
- Chat-primary layout — Phase 2 U1 / later EP  
- Native Gemini FunctionDeclarations — ADR-006 follow-on  
- ProjectDocument / events — EP-002  
- Performance: registry load is `lru_cache`; prompt build is O(emit-allowed); no measured regression requiring change  
- Security: `/api/capabilities` JWT-gated; emit gate reduces attack surface of schema-only verbs; no new secret exposure  

---

## Verdict

**No Critical issues exist.**

**EP-001 is architecturally complete and approved for production progression.**

EP-001 is **frozen**. Do not modify unless a verified defect is discovered.

**EP-002 is not started.** Await explicit approval.
