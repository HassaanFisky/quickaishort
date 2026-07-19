# 28 — Implementation Blueprint (AntiGravity Task Pack)

**Goal:** Evolve QuickAI Shorts → QuickAI Studio with minimal rewrites.  
**Rule:** Each task independently shippable. Verify before next.  
**Do not** invent files — paths below exist unless marked CREATE.

---

## Global acceptance criteria

- [ ] `cd frontend && npx tsc --noEmit` clean  
- [ ] `cd frontend && pnpm build` clean  
- [ ] `python -m py_compile` on touched BE files  
- [ ] No Adobe trademark hits in FE (`docs/PRODUCTION_READINESS.md` grep)  
- [ ] Claims in PR match `27-validation-report.md` discipline  

---

## PHASE 0 — Safety & truth

### T-0.1 Secure pipeline endpoint

| Field | Value |
|-------|-------|
| Files | `fastapi/routers/pipeline_router.py`, optionally `frontend` callers |
| Change | Add `user_id: str = Depends(get_verified_user_id)`; bind credits; use verified id in enqueue |
| Deps | `services.auth.get_verified_user_id`, `stats_service.deduct_credits` |
| Impact | Security high |
| Breaking | Clients without JWT fail — intended |
| Rollback | Revert commit |
| Validate | Unauthed POST → 401/403; authed → 200/402 |
| Done when | Auth dependency present + test or manual curl recorded |

### T-0.2 Credit fail-closed (production)

| Field | Value |
|-------|-------|
| Files | `fastapi/routers/ai_editor_router.py` (both command handlers) |
| Change | On credit service errors in production, do not proceed; only allow soft-fail if explicit env `CREDITS_SOFT_FAIL=true` |
| Impact | Revenue/integrity |
| Rollback | Revert |
| Validate | Mock stats failure → 503/402 not 200 with actions |

### T-0.3 Doc drift patch (non-code)

| Field | Value |
|-------|-------|
| Files | `CLAUDE.md` (working memory), `ARCHITECTURE.md` header versions, `README.md` link to `docs/studio/` |
| Change | Replace firebase_auth claim; Next version 14.2.35; ADK ≥2.1; link Studio docs |
| Validate | Grep shows no `firebase_auth.py` claim |

### T-0.4 Action coverage matrix

| Field | Value |
|-------|-------|
| Files | CREATE `docs/studio/matrices/action-coverage.md` |
| Change | Table: action type → sanitiser → FE handler → export effect |
| Method | Diff `models/ai_editor.py` unions vs `editorStore` switch vs sanitiser allowlist |
| Done when | Every Pydantic action type classified Supported / Partial / Emit-blocked |

---

## PHASE 1 — Tool catalogue unification

### T-1.1 Single source of tool definitions

| Field | Value |
|-------|-------|
| Files | CREATE `fastapi/services/tool_registry.py` (or `fastapi/tools/registry.py`); update `ai_editor_engine.py`, `frontend/src/lib/aiToolCatalog.ts` |
| Change | Python registry exports JSON Schema; FE imports generated JSON committed at `frontend/src/lib/generated/tools.json` OR shared OpenAPI fragment |
| Order | Registry → sanitiser allowlist from registry → FE catalog reads registry |
| Impact | Prevents dialect drift |
| Risk | Medium (prompt changes) |
| Rollback | Keep old prompts behind `AI_EDITOR_PROMPT_V1=true` |
| Validate | Same tool id set length FE==BE; unit test |

### T-1.2 Merge duplicate AI panels

| Field | Value |
|-------|-------|
| Files | `frontend/src/components/editor/AIPanel.tsx`, `frontend/src/components/ai/AIPanel.tsx`, imports in EditorLayout |
| Change | One panel component; delete or re-export stub |
| Validate | Editor builds; chat suggestions still show |

### T-1.3 Align `/api/ai-edit` and `/api/ai-editor/command`

| Field | Value |
|-------|-------|
| Files | `ai_editor_engine.py`, `ai_editor_router.py`, `frontend/src/lib/aiEditorClient.ts`, `gemini-editor.ts` |
| Change | Both endpoints call one `plan_and_sanitise()`; FE prefers one client |
| Done when | Only one prompt dialect in engine |

---

## PHASE 2 — Native function calling (evolution)

### T-2.1 Gemini tool declarations

| Field | Value |
|-------|-------|
| Files | `fastapi/services/gemini_client.py`, `ai_editor_engine.py` |
| Change | Add optional `tools=` FunctionDeclarations from registry; parse function_call responses into actions |
| Fallback | If model returns plain JSON text, existing parser remains |
| Risk | Medium |
| Validate | Integration test with mock client; golden prompts |
| OSS | Use existing `google-genai` (Apache 2.0) — no new LLM vendor |

### T-2.2 Executor loop (multi-step)

| Field | Value |
|-------|-------|
| Files | CREATE `fastapi/services/tool_executor.py`; wire from engine |
| Change | Max N steps; stop on final `respond_to_user`; client-exec tools returned as actions batch; server tools invoked inline |
| Validate | Prompt “remove silences then add captions” → ordered actions |

---

## PHASE 3 — Chat-primary UX

### T-3.1 Default layout

| Field | Value |
|-------|-------|
| Files | `EditorLayout.tsx`, CSS/tailwind grid classes |
| Change | Default: chat column ≥36% width, canvas center, timeline dock collapsed-to-context height; keep `?advanced=1` for 3-column inspector |
| Ads | If adding Ads nav: blurred overlay + “Coming Soon” component — CREATE `components/shared/ComingSoonGate.tsx` |
| Validate | Visual QA mobile+desktop; no advanced required for AI edit |

### T-3.2 Suggestion rail API

| Field | Value |
|-------|-------|
| Files | CREATE `fastapi/routers/suggestions_router.py` or endpoint in main; `gemini-editor.ts`; `AIPanel.tsx` |
| Change | `GET/POST /api/studio/suggestions` returns dynamic list from Analysis snapshot; FE falls back to `generateImmediateSuggestions` if 404/slow |
| Cost | Cache Redis 15m per video_id+hash |
| Validate | After load, chips ≠ only static general list for known titles |

### T-3.3 Brand strings

| Field | Value |
|-------|-------|
| Files | `Sidebar.tsx`, `extension/README.md`, selected marketing copy |
| Change | “QuickAI Studio” primary; keep domain |
| Validate | No broken i18n keys |

---

## PHASE 4 — AnalysisAgent (aggregate first)

### T-4.1 Aggregate analysis endpoint

| Field | Value |
|-------|-------|
| Files | CREATE `fastapi/services/analysis_service.py`; endpoint; FE `useMediaPipeline` post-hook |
| Change | Accept transcript + optional client signals (silences, scenes, faces summary); persist under project/Firestore; return suggestion seeds |
| Do not | Buy new paid vision APIs until aggregate proves insufficient |
| Validate | One round-trip after Whisper completes |

---

## PHASE 5 — Server tools + manifest

### T-5.1 Server tool: silence bake preview markers

| Field | Value |
|-------|-------|
| Files | `ai_editor` RemoveSilences handling; optional server compute of cut list; FE applies cut list |
| Validate | Cuts match silence thresholds |

### T-5.2 Expand manifest_renderer

| Field | Value |
|-------|-------|
| Files | `services/manifest_renderer.py`, tests |
| Change | Cover captions+overlays+speed paths used by FE `compileRenderManifest` |
| Validate | `pytest fastapi/tests/test_manifest_renderer.py` green + sample fixture render |

### T-5.3 Persist manifest on export

| Field | Value |
|-------|-------|
| Files | `render_worker.py` (already has persist hooks), FE `useServerExport.ts` |
| Change | Always send `render_manifest` when multi-element timeline |
| Validate | Worker logs compile success; export playable |

---

## PHASE 6 — Legacy freeze

### T-6.1 Deprecate GridFS API in docs + response headers

| Field | Value |
|-------|-------|
| Files | `routers/video.py`, `docs/VIDEO_API.md` |
| Change | `Deprecation` header; doc warning |
| Validate | Header present |

### T-6.2 Fix `gridfs://` mislabel

| Field | Value |
|-------|-------|
| Files | `routers/youtube.py`, `tts_service.py` (and grepped emitters) |
| Change | Emit `gs://bucket/path` |
| Validate | Grep `gridfs://` only in legacy GridFS module |

---

## Open-source additions (only if needed)

| Need | Candidate | License | Why | Integrate | Risk |
|------|-----------|---------|-----|-----------|------|
| Schema codegen | `datamodel-code-generator` | MIT | Pydantic↔TS | CI generate step | Low |
| FC already | `google-genai` | Apache-2.0 | Already in tree | gemini_client | Low |
| Avoid | GPL NLE frameworks | GPL | Copyleft | — | High |

Do **not** add OpenAI SDK.

---

## Execution order (strict)

```text
T-0.1 → T-0.2 → T-0.3 → T-0.4
     → T-1.1 → T-1.3 → T-1.2
     → T-2.1 → T-2.2
     → T-3.1 → T-3.2 → T-3.3
     → T-4.1
     → T-5.1 → T-5.2 → T-5.3
     → T-6.2 → T-6.1
```

---

## Per-task template for AntiGravity prompts

```text
Read docs/studio/28-implementation-blueprint.md task T-X.Y.
Read cited files in full before edit.
Do not expand scope.
Run listed Validate commands.
Update docs/studio/27-validation-report.md if you disprove a claim.
```
