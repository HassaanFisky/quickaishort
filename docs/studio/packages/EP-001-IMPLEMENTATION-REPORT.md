# EP-001 Implementation Report

**Package:** Capability Registry ABI  
**Date:** 2026-07-18  
**Status:** Implementation complete — **awaiting explicit approval before EP-002**  
**Authority:** `docs/studio/packages/EP-001-capability-registry-abi.md`, ADR-007

---

## Files created

| Path | Role |
|------|------|
| `fastapi/services/tool_registry.py` | Load/validate/query/alias/normalize/prompt builder |
| `fastapi/tests/test_tool_registry.py` | 11 contract tests |
| `fastapi/scripts/sync_capabilities_to_frontend.py` | BE → FE registry sync |
| `fastapi/scripts/bootstrap_capability_registry.py` | Registry bootstrap (pre-seeded) |
| `fastapi/capabilities/registry.v1.json` | 78 capabilities |
| `fastapi/capabilities/aliases.v1.json` | ToolName → capability_id |
| `fastapi/capabilities/schema.v1.json` | JSON Schema contract |
| `frontend/src/lib/generated/capabilities.v1.json` | Synced FE copy |
| `docs/studio/contracts/capabilities.schema.v1.json` | Docs mirror |
| `docs/studio/contracts/capabilities.aliases.v1.json` | Docs mirror |
| `docs/studio/adrs/ADR-007-capability-registry-abi.md` | Binding ADR |
| `docs/studio/packages/EP-001-IMPLEMENTATION-REPORT.md` | This report |

---

## Files changed

| Path | Change |
|------|--------|
| `fastapi/services/ai_editor_sanitiser.py` | Emit gate: drop `unknown_capability` / `emit_blocked:*`; `enforce_emit_policy` kwarg (default True) |
| `fastapi/services/ai_editor_engine.py` | Registry-built prompts; legacy ToolName normalisation; canonical action responses |
| `fastapi/routers/ai_editor_router.py` | `GET /api/capabilities?lite=` (JWT) |
| `fastapi/models/ai_editor.py` | `ToolName` deprecated docstring; `EditorCommandResponse.actions` → canonical dicts |
| `fastapi/services/diagnostics.py` | Startup `assert_registry_valid()` — fail closed |
| `fastapi/tests/test_ai_editor.py` | Clamp tests use `enforce_emit_policy=False` (emit policy covered in registry tests) |
| `frontend/src/lib/gemini-editor.ts` | Canonical `EditorCommandResponse` types |
| `frontend/src/components/editor/AIPanel.tsx` | Apply canonical actions; legacy `{tool}` safety net |
| `frontend/src/lib/aiToolCatalog.ts` | Import generated registry; gemini tools gated by `orchestrator_emit` |
| `docs/studio/packages/EP-001-capability-registry-abi.md` | Status → IMPLEMENTED |
| `docs/studio/README.md` | Packages index (prior) |

---

## Architectural decisions made

1. **Canonical id = `AiEditorAction.type`** (SCREAMING_SNAKE). Confirmed ADR-007.
2. **`ToolName` dialect is aliases-only** — normalised in `normalize_command_actions`; no new enum members.
3. **Fail-closed emit policy** — LLM/sanitiser cannot apply `orchestrator_emit=false` capabilities (e.g. `SET_KEYFRAME`).
4. **Planner prompts are registry-generated** — hardcoded 17-tool list removed from live engine paths.
5. **Startup validation** — invalid/missing registry halts startup diagnostics.
6. **Clamp unit tests exempted via flag** — production path always enforces emit policy.
7. **Command API returns canonical actions** — FE updated; optional legacy `{tool,params}` still accepted inbound.

---

## Backward compatibility

| Surface | Status |
|---------|--------|
| `/api/ai-edit` request/response envelopes | Preserved |
| `AiEditorAction` discriminator values | Preserved |
| Inbound legacy `{tool,params,order}` on command path | Accepted → normalised |
| Outbound command `actions` shape | **Breaking for clients expecting `{tool,params,order}`** — FE `AIPanel` + `gemini-editor.ts` updated in this EP |
| Direct catalog tools (`execMode=direct`) | Still run locally even if emit=false |
| Gemini catalog tools with emit=false | Hidden/disabled in `searchTools` |

---

## Remaining risks

| Risk | Severity | Notes |
|------|----------|-------|
| Over-blocking: many Premiere-like verbs now emit=false | Medium (intentional) | Flip `orchestrator_emit` only after handler+bake verification (later EP) |
| Alias param mapping incomplete for edge ToolParams | Low | Fail closed with `alias_param_unmapped` |
| FE/BE registry skew if sync script not re-run | Medium | Run `fastapi/scripts/sync_capabilities_to_frontend.py` after registry edits |
| `EXPLAIN_LAST_EDIT` gemini catalog entry disabled (emit=false) | Low | Correct per honesty bar |
| Startup now hard-fails on registry drift | Low | Desired; CI must keep registry in sync with Pydantic |

---

## Test results

```text
pytest tests/test_tool_registry.py tests/test_ai_editor.py -q
82 passed

python -c "from services.tool_registry import assert_registry_valid; assert_registry_valid()"
OK

python -m py_compile services/tool_registry.py services/ai_editor_engine.py ...
OK

npx tsc --noEmit  (frontend/)
exit_code: 0
```

Manual spot-check:

```text
sanitise([SET_KEYFRAME], state) → dropped ['emit_blocked:SET_KEYFRAME']
resolve_alias('razor_tool') → BLADE_SPLIT
```

---

## Blockers preventing EP-001 completion

**None for code/tests.**

Awaiting:

1. Founder / Principal review acceptance of this report  
2. Explicit approval to start **EP-002** (ProjectDocument + Event commit path)

---

## Do not start next

EP-002 and later packages are **blocked** until explicit approval after this report is accepted.
