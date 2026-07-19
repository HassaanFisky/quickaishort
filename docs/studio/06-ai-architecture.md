# 06 — AI Architecture

## Verdict

| Capability | Supported today? | Evidence |
|------------|------------------|----------|
| Conversational editing | **Partial — Yes** | AIPanel + commander + applyAiEdits |
| Tool orchestration | **Partial** | Prompt lists tools; JSON actions; no dependency graph engine |
| Structured function calling (native) | **No** | `gemini_client.call_gemini*` = `generate_content`; no FunctionDeclaration in ai_editor path |
| Long-running tasks | **Partial** | RQ render; AI edit is sync ≤30s timeout |
| Context persistence | **Partial** | Request carries `current_state` + transcript; ADK uses Firestore sessions; no long-term edit memory graph |
| Multimodal reasoning | **Partial** | Transcript-heavy; vision/frame paths exist in viral agent optionally — not unified for editor |
| Planning | **Partial** | Prompt asks for action arrays / tool sequences |
| Execution | **Client Yes / Server Limited** | Zustand apply; server export separate |
| Recovery | **Partial** | Undo/redo stacks; render DLQ; AI cancel abort |
| Verification | **Weak** | Sanitiser clamps/drops; no post-edit QA agent |

---

## Current AI stack (facts)

### 1. AI Editor (conversational NLE bridge)

```text
Prompt + AIEditorCurrentState + transcript
        ↓
ai_editor_engine (system prompt + Gemini JSON)
        ↓
sanitiser
        ↓
AIEditorResponse { actions, message, suggestions, clamped, dropped }
        ↓
FE applyAiEdits
```

Files:
- `fastapi/services/ai_editor_engine.py`
- `fastapi/routers/ai_editor_router.py`
- `fastapi/models/ai_editor.py`
- `frontend/src/hooks/useAiCommander.ts`

Two prompt dialects exist:
1. Legacy rich action types (`ADD_CAPTION`, `TRIM`, …) in FE `EDITOR_SYSTEM_PROMPT` (`gemini-editor.ts`) and older `/api/ai-edit` path.
2. Phase-56 17-tool Premiere-like names (`ripple_delete`, `razor_tool`, …) in `ai_editor_engine.EDITOR_SYSTEM_PROMPT`.

**Risk:** Dialect drift between FE catalog, BE models, and prompts.

### 2. ADK multi-agent (analysis / validation / storyboard)

| Agent | File | Tools? |
|-------|------|--------|
| Viral | `agent/viral_agent.py` | ADK `FunctionTool(get_viral_score_cache)` only |
| Preflight | `agent/preflight_agent.py` | Custom BaseAgents; no FunctionTool catalogue for editing |
| Director | `agent/director_agent.py` | JSON storyboard, no edit tools |
| Script | `agent/script_agent.py` | Direct genai + Pexels/TTS helpers |

### 3. Model access

`services/gemini_client.py`:
- `DEFAULT_MODEL` = `GEMINI_MODEL` or `gemini-2.5-flash`
- Plain content generation + retries
- **Not** a tool-runtime host

### 4. Router / tiering

`services/ai_router.py` referenced by engine for `get_model_for_task` — model selection by task/tier.

---

## Target AI architecture (Studio)

```text
┌──────────────────────────────────────────────────────────┐
│                 Orchestrator Agent                        │
│  intent → plan → select tools → execute → verify → reply │
└───────────────┬───────────────────────┬──────────────────┘
                │                       │
     ┌──────────▼──────────┐   ┌────────▼────────────┐
     │  Native Tool Calls  │   │  Suggestion Agent   │
     │  (Gemini FC / ADK)  │   │  (post-analysis)    │
     └──────────┬──────────┘   └─────────────────────┘
                │
     ┌──────────▼──────────────────────────────────────┐
     │                 Tool Runtime                     │
     │  registry · auth · cost · idempotency · timeouts │
     │                                                  │
     │  ClientTools │ ServerTools │ RenderTools         │
     └──────────────────────────────────────────────────┘
```

### Required subsystems

1. **Tool Registry** — single JSON Schema source generated into FE types + BE Pydantic + Gemini declarations.  
2. **Planner** — may remain LLM; must output ordered tool calls with deps.  
3. **Executor** — routes `execMode` local vs server; awaits long jobs via job_id.  
4. **Verifier** — checks timeline invariants (no negative duration, captions inside clip, etc.).  
5. **Memory** — session edit log + project snapshot (RenderManifest).  
6. **Analysis Agent** — runs once on load; feeds suggestions.  

---

## Cost strategy (AI)

| Prefer | Avoid |
|--------|-------|
| Instant heuristic suggestions | Gemini on every hover |
| `execMode=direct` catalog tools | LLM for Seek/Play/Pause |
| Cache viral/analysis Redis | Re-score identical video_id |
| Flash model | Pro models without measured gain |
| Transcript windowing (`_MAX_TRANSCRIPT_WORDS`) | Full dump every call |

---

## Migration path (no rewrite)

1. Freeze dual prompts → one catalogue.  
2. Add native function declarations mirroring catalogue.  
3. Keep JSON fallback for 1 release.  
4. Introduce server tools only where client cannot (bake, download, TTS).  
5. Add Analysis Agent endpoint → FE suggestion rail.  

See ADR-006 and blueprint tasks T-AI-*.
