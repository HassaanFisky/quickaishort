# EP-001 — Capability Registry ABI

**Status:** IMPLEMENTED — awaiting founder acceptance (see `EP-001-IMPLEMENTATION-REPORT.md`)  
**Priority:** P0 — Phase 2 Part G step 1 (blocks Orchestrator, Suggestions, honest chat UX)  
**Supersedes conflicting guidance:** Prompt-listed dual dialects as permanent design  
**Affirms:** Phase 2 Decisions A3, A4 (prompt-stuffed lists), A9, A12; ADR-006 direction  
**Does not implement yet:** ProjectDocument events, MediaGraph, chat shell (later EPs)

---

## 1. Objective

Establish a single **Capability Registry ABI** as the operating-system contract for every editing tool in QuickAI Studio so that:

- Backend Pydantic actions, frontend catalog, sanitiser allowlist, and Gemini tool surfaces cannot drift
- The 17-name `ToolName` dialect stops being a second source of truth
- Future orchestrator can retrieve top-K capabilities instead of stuffing hundreds of tools into prompts
- Emit-blocked / partial / wired statuses are explicit machine data

**Non-objective:** Rewriting `editorStore` handlers, chat layout, or MediaGraph in this package.

---

## 2. Technical reasoning

### Verified dialect cancer (repository)

| Surface | Contract | Evidence |
|---------|----------|----------|
| Canonical NLE actions | `AiEditorAction` discriminated by `type` (e.g. `TRIM`, `RIPPLE_DELETE`) | `fastapi/models/ai_editor.py` union ~L798–878 |
| Parallel command dialect | `ToolName` enum (`razor_tool`, `ripple_delete`, …) 17 values | same file ~L926–943 |
| Engine prompt for `/api/ai-editor/command` | Lists only those 17 tools | `fastapi/services/ai_editor_engine.py` `EDITOR_SYSTEM_PROMPT` |
| Legacy `/api/ai-edit` path | Rich `AiEditorAction` JSON via sanitiser | `ai_editor_router.py` + `ai_editor_sanitiser.py` |
| FE catalog | `aiToolCatalog.ts` maps UI tools → `AiEditorAction["type"]` with `execMode` | `frontend/src/lib/aiToolCatalog.ts` |
| FE apply | `dispatchAIActions` / `applyAiEdits` switch on SCREAMING_SNAKE types | `frontend/src/stores/editorStore.ts` |
| Registry module | **Does not exist** | glob `**/tool_registry*` → 0 files |

**Conclusion:** The executable client path already speaks `AiEditorAction.type`. The Phase-56 `ToolName` dialect is a divergent planner vocabulary. The ABI must canonically use **`capability_id === action type string`** (e.g. `TRIM`), with an optional deprecated alias map from `ToolName` → capability_id for one release.

### Why this before ProjectDocument / MediaGraph

Without a registry:

- Orchestrator cannot safely plan
- Sanitiser cannot fail closed on unknown/partial tools
- Suggestion intents cannot bind to tool IDs
- Adding tools creates 4-way drift (models / FE types / prompt / store)

This is the smallest change that unlocks every later OS step.

---

## 3. Architecture impact

```text
BEFORE                          AFTER
------                          -----
ai_editor.py unions      ──┐
aiToolCatalog.ts         ──┼─►  capabilities/registry.v1.json  (source of truth)
EDITOR_SYSTEM_PROMPT     ──┤         │
ToolName enum            ──┘         ├──► tool_registry.py (load/validate/query)
                                     ├──► sanitiser allowlist (emit policy)
                                     ├──► engine prompt builder (retrieved subset)
                                     ├──► FE generated/tools.json (+ catalog adapter)
                                     └──► future Gemini FunctionDeclarations
```

| Layer | Change |
|-------|--------|
| Storage / RQ / GCS / auth | **None** |
| `AiEditorAction` models | **Remain** wire format; registry *describes* them |
| `ToolName` / `EditorAction` | **Deprecated adapter** — map to capability_id; no new tools added here |
| Prompts | Built from registry, never hand-maintained lists |
| FE | Catalog reads registry metadata; keep `buildActions` local |

---

## 4. Required files

### CREATE

| Path | Purpose | Seed status |
|------|---------|-------------|
| `fastapi/capabilities/schema.v1.json` | JSON Schema for registry file | **SEEDED** (mirror: `docs/studio/contracts/capabilities.schema.v1.json`) |
| `fastapi/capabilities/registry.v1.json` | Canonical registry document | **SEEDED** via `fastapi/scripts/bootstrap_capability_registry.py` (78 actions) |
| `fastapi/capabilities/aliases.v1.json` | `ToolName` → `capability_id` map | **SEEDED** |
| `fastapi/services/tool_registry.py` | Load, validate, query, retrieve top-K, build prompt section | **TODO** |
| `fastapi/tests/test_tool_registry.py` | Contract tests | **TODO** |
| `frontend/src/lib/generated/capabilities.v1.json` | Committed copy of registry for FE | **TODO** (sync script) |
| `scripts/sync_capabilities_to_frontend.py` or `fastapi/scripts/sync_capabilities_to_frontend.py` | BE → FE sync | **TODO** |
| `docs/studio/adrs/ADR-007-capability-registry-abi.md` | Binding ADR | **DONE** |
| `docs/studio/packages/EP-001-capability-registry-abi.md` | This package | **DONE** |

### MODIFY

| Path | Change |
|------|--------|
| `fastapi/services/ai_editor_engine.py` | Replace hardcoded 17-tool prompt with `tool_registry.build_planner_prompt(intent_tags=...)`; map command dialect outputs through aliases |
| `fastapi/services/ai_editor_sanitiser.py` | Before type switches: drop actions whose `orchestrator_emit` is false or unknown id |
| `fastapi/models/ai_editor.py` | Add docstring: `ToolName` deprecated; do **not** delete enum yet |
| `frontend/src/lib/aiToolCatalog.ts` | Import capability metadata from generated JSON for id/name/exec_locus/cost; keep `buildActions` |
| `fastapi/routers/ai_editor_router.py` | Optional: `GET /api/capabilities` (auth JWT) returning registry subset for FE bootstrap |

### DO NOT TOUCH in this EP

- `editorStore.ts` handler bodies (except if a test proves a type must be emit_blocked — then registry only)
- `EditorLayout.tsx` / chat UX
- Media pipeline / render worker
- ProjectDocument (EP-002)

---

## 5. Exact implementation order

```text
Step 1  Write schema.v1.json
Step 2  Write aliases.v1.json (ToolName → capability_id)
Step 3  Write registry.v1.json bootstrap (all AiEditorAction types + policy flags)
Step 4  Implement tool_registry.py (load + validate against schema + query API)
Step 5  Add test_tool_registry.py (schema validation, alias map, emit policy)
Step 6  Wire sanitiser emit gate (fail closed on unknown / emit=false)
Step 7  Wire ai_editor_engine prompt builder + alias normalization for command path
Step 8  Add GET /api/capabilities (thin)
Step 9  scripts/sync_capabilities_to_frontend.py + run it
Step 10 Adapt aiToolCatalog.ts to read generated JSON metadata
Step 11 ADR-007 commit note + py_compile + pytest + tsc
```

Do not reorder Step 6 before Step 4.

---

## 6. Required code changes

### 6.1 Capability record shape (normative)

Every capability in `registry.v1.json`:

```json
{
  "id": "TRIM",
  "version": 1,
  "title": "Trim clip in/out",
  "description": "Set selected clip start/end in seconds.",
  "tags": ["timeline", "clip", "trim"],
  "side_effects": ["mutate_project", "preview"],
  "exec_locus": "client",
  "cost_class": "free",
  "latency_class": "instant",
  "idempotent": false,
  "parallel_safe": false,
  "requires_facets": [],
  "orchestrator_emit": true,
  "runtime_status": "wired",
  "compensating_hint": "undo_event",
  "param_schema": {
    "type": "object",
    "required": ["start", "end"],
    "properties": {
      "start": { "type": "number", "minimum": 0 },
      "end": { "type": "number", "minimum": 0 }
    }
  },
  "aliases": []
}
```

Field rules:

| Field | Allowed values | Meaning |
|-------|----------------|---------|
| `id` | Must equal `AiEditorAction.type` literal | Canonical ABI id |
| `exec_locus` | `client` \| `server` \| `worker` | Where execution runs **today** |
| `cost_class` | `free` \| `llm` \| `bake` \| `network` | Billing / planner cost |
| `runtime_status` | `wired` \| `partial` \| `schema_only` | FE/store reality |
| `orchestrator_emit` | bool | If false, sanitiser **drops** LLM emissions |
| `requires_facets` | string[] | Future MediaGraph facet keys (may be empty now) |
| `side_effects` | subset of `preview`, `mutate_project`, `network`, `bake`, `billing`, `ui_only` | Scheduler constraints |

### 6.2 Bootstrap emit policy (normative for v1)

**`orchestrator_emit: true`** only for this initial set (verified common path + sanitiser coverage):

`ADD_CAPTION`, `REMOVE_CAPTION`, `UPDATE_CAPTION`, `TRIM`, `SPLIT_CLIP`, `DELETE_CLIP`, `SELECT_CLIP`, `ADD_FILTER`, `RESET_FILTER`, `SET_VISUAL_FILTER`, `SET_AUDIO_BOOST`, `SET_NOISE_REDUCTION`, `SET_PLAYBACK_SPEED`, `TOGGLE_CAPTIONS`, `TOGGLE_TRANSITIONS`, `TOGGLE_VOICEOVER`, `SEEK`, `PLAY`, `PAUSE`, `EXPORT_CLIP`, `ADD_ELEMENT`, `UPDATE_ELEMENT`, `REMOVE_ELEMENT`, `REMOVE_SILENCES`, `BLADE_SPLIT`, `RIPPLE_DELETE`, `MARK_IN`, `MARK_OUT`, `RANGE_MARK`, `DETECT_VIRAL_MOMENTS`, `GENERATE_HOOK_CAPTION`, `SUGGEST_STYLE_PRESET`, `ADD_BROLL`, `ADD_VIDEO_OVERLAY`, `REMOVE_OVERLAY`

**All other `AiEditorAction` types** must appear in the registry with `orchestrator_emit: false` and `runtime_status` of `partial` or `schema_only` until a later EP verifies handlers and bake fidelity.

**Rationale:** Prevents the model from “editing” via schema-only Premiere verbs that do not meet Studio OS honesty bar (Phase 2 Decision A5e).

### 6.3 Alias map (normative)

`aliases.v1.json`:

```json
{
  "version": 1,
  "deprecated_dialect": "ToolName",
  "map": {
    "selection_tool": "POINTER_SELECT",
    "select_forward": "FORWARD_LANE_SELECT",
    "select_backward": "BACKWARD_LANE_SELECT",
    "ripple_delete": "RIPPLE_DELETE",
    "rolling_edit": "ROLLING_TRIM",
    "rate_stretch": "DURATION_STRETCH",
    "razor_tool": "BLADE_SPLIT",
    "slip_tool": "SLIP_CLIP",
    "slide_tool": "SLIDE_CLIP",
    "pen_keyframe": "SET_KEYFRAME",
    "rect_mask": "ADD_RECT_MASK",
    "ellipse_mask": "ADD_ELLIPSE_MASK",
    "hand_tool": "SCROLL_HAND",
    "zoom_tool": "TIMELINE_ZOOM",
    "text_horizontal": "ADD_ELEMENT",
    "text_vertical": "ADD_ELEMENT",
    "ai_extender": null
  },
  "notes": {
    "ai_extender": "No AiEditorAction equivalent — orchestrator_emit stays false; command path must no_op with clarification",
    "text_*": "Map to ADD_ELEMENT with TEXT element; param text_content → element.text"
  }
}
```

### 6.4 `tool_registry.py` public API (normative)

```python
# fastapi/services/tool_registry.py

def load_registry() -> dict: ...
def get_capability(capability_id: str) -> dict | None: ...
def list_emit_allowed() -> list[dict]: ...
def resolve_alias(tool_name: str) -> str | None: ...
def normalize_command_actions(actions: list[dict]) -> list[dict]:
    """Convert {tool, params, order} → {type, ...fields} using aliases + param mapping."""

def retrieve_for_intent(tags: list[str], limit: int = 24) -> list[dict]:
    """Tag overlap retrieval among orchestrator_emit=true; fallback = all emit-allowed capped."""

def build_planner_prompt_section(capabilities: list[dict]) -> str:
    """Deterministic markdown/JSON tool list for Gemini — no hand-written catalog."""

def assert_registry_valid() -> None:
    """Raise on schema failure or id not in known AiEditorAction discriminator set."""
```

Param mapping minimum for command path:

| ToolParams field | Target action fields |
|------------------|----------------------|
| `clip_id` | `clip_id` or `id` as required by target type |
| `start_time` / `end_time` | `start`/`end` or `time_sec` / `in_sec`/`out_sec` by type |
| `value` | type-specific (`delta_sec`, `zoom_factor`, …) — if ambiguous, drop + clamped reason |
| `text_content` | `ADD_ELEMENT.element.text` |
| `speed_factor` | `DURATION_STRETCH.speed_factor` |

Insufficient mapping → drop action with `dropped` reason `alias_param_unmapped` (do not guess).

### 6.5 Sanitiser gate (normative)

At top of `sanitise()` loop, after reading `action.type`:

```text
if type not in registry:
    drop "unknown_capability"
elif not registry[type].orchestrator_emit:
    drop "emit_blocked:{type}"
else:
    existing clamp logic
```

Unknown types must never pass through “because Pydantic accepted them” if registry is authoritative — keep Pydantic validation, add registry policy.

### 6.6 Engine prompt (normative)

Delete the hardcoded 17-tool list from `EDITOR_SYSTEM_PROMPT` as the live catalog.

Replace with:

1. Static role preamble (Studio OS editor kernel; JSON only)
2. `build_planner_prompt_section(retrieve_for_intent(tags))` where tags derived by cheap keyword tagger **for retrieval only** (not for user-facing suggestions — Phase 2 A5a still holds for chips)
3. Output schema: prefer **canonical** `{ "actions": [ { "type": "TRIM", ... } ], "message", "suggestions" }` aligned with `/api/ai-edit`

**Migration bridge (one release):**

- `/api/ai-editor/command` may still accept model output in old `{tool, params, order}` shape
- `normalize_command_actions` converts to `AiEditorAction` list
- Response may include both `actions` (canonical) and deprecated `editor_actions` if FE still needs it — verify FE callers before dual response; if only `gemini-editor.ts` uses command path, migrate that client to canonical actions in same EP

Verified FE command client: `frontend/src/lib/gemini-editor.ts` calls `/api/ai-editor/command` and `/stream`. Update those parsers to canonical `type` actions in Step 7–10.

### 6.7 FE catalog adapter

`aiToolCatalog.ts`:

- Keep `AI_TOOL_CATALOG` entries that have `buildActions` (direct UX)
- For each entry, `capabilityId` must reference registry `id`
- Display name/description may override registry title
- Reject / disable catalog entries whose capability `orchestrator_emit` is false **when routed through gemini execMode**
- `direct` execMode tools may still run locally even if emit false (user-initiated mechanical ops) — set `cost_class: free` and document in registry as `side_effects: ["ui_only"]` or `preview` as appropriate

---

## 7. API / schema / interface changes

### 7.1 New endpoint

```http
GET /api/capabilities
Authorization: Bearer <JWT>
```

Response:

```json
{
  "version": 1,
  "capabilities": [ /* emit-allowed + partial metadata; omit giant param_schema if ?lite=1 */ ]
}
```

Query: `lite=1` returns id, title, tags, exec_locus, cost_class, runtime_status, orchestrator_emit only.

### 7.2 Unchanged wire formats (preserve)

- `AIEditorRequest` / `AIEditorResponse` remain for `/api/ai-edit`
- `AiEditorAction` discriminator values unchanged

### 7.3 Soft-deprecated

- `ToolName` enum: no new members
- Hardcoded `EDITOR_SYSTEM_PROMPT` tool list

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Over-blocking emit breaks existing prompts that used schema-only tools | Expected; return `no_op` / clarification; better than fake edits |
| Alias param mapping incomplete | Fail closed with `dropped`; log; extend map deliberately |
| FE/BE registry skew | CI/script sync; test that hashes match |
| Registry file huge | Retrieve top-K for prompts; full file for sanitiser |
| Developers add Pydantic action without registry entry | `assert_registry_valid` compares discriminator set ⊆ registry ids and vice versa in tests |

---

## 9. Validation checklist

Implementer must run and record:

```bash
# Backend
cd fastapi
venv\Scripts\python -m py_compile services/tool_registry.py
venv\Scripts\python -m pytest tests/test_tool_registry.py -q

# Registry covers every AiEditorAction discriminator
venv\Scripts\python -c "from services.tool_registry import assert_registry_valid; assert_registry_valid()"

# Frontend
cd frontend
python ../scripts/sync_capabilities_to_frontend.py
npx tsc --noEmit
```

Manual:

- [ ] `POST /api/ai-edit` with `TRIM` still applies  
- [ ] Model emitting `SET_KEYFRAME` while emit=false → dropped, not applied  
- [ ] `POST /api/ai-editor/command` with legacy `razor_tool` normalizes to `BLADE_SPLIT` or equivalent  
- [ ] `GET /api/capabilities?lite=1` returns 200 with JWT  
- [ ] No Adobe trademark strings introduced in FE  

---

## 10. Definition of Done

EP-001 is done only when:

1. `registry.v1.json` exists, schema-valid, and contains **every** `AiEditorAction` discriminator id  
2. `tool_registry.py` is the only planner catalog source used by `ai_editor_engine.py`  
3. Sanitiser drops `orchestrator_emit: false` and unknown ids  
4. `ToolName` dialect is alias-only (documented deprecated)  
5. FE generated capabilities file is synced and catalog references capability ids  
6. Tests green; `tsc --noEmit` green  
7. ADR-007 accepted in `docs/studio/adrs/`  
8. No chat-layout or MediaGraph scope creep merged in the same PR  

---

## Cursor execution prompt (copy-paste)

```text
Implement docs/studio/packages/EP-001-capability-registry-abi.md exactly.
Follow section 5 order. Do not expand into MediaGraph, ProjectDocument, or EditorLayout.
Read fastapi/models/ai_editor.py AiEditorAction union and ToolName before writing registry ids.
After implementation, run section 9 validation commands and fix until green.
```

---

## Next EP (do not start here)

**EP-002 — ProjectDocument + Event commit path** (Phase 2 Part G step 2), which depends on stable `capability_id` strings from this registry.
