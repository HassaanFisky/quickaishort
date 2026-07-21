# 07 — Agent Architecture

## Official agent set (scaffolds)

Source: `fastapi/agent/scaffolds/AGENTS.md`

| Agent ID | Role | Required env |
|----------|------|--------------|
| `ai_editor_agent` | NL → timeline actions | `GEMINI_API_KEY` |
| `preflight_agent` | Audience simulation | `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT` |
| `viral_agent` | Segment + score | `GEMINI_API_KEY`, `REDIS_URL` |
| `director_agent` | Storyboard | `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT` |
| `render_agent` | RQ ffmpeg worker | `REDIS_URL`, `GOOGLE_CLOUD_PROJECT`, `EXPORT_SIGNING_SECRET` |

Additional scaffold files: `IDENTITY.md`, `SOUL.md`, `MEMORY.md`, `BOOTSTRAP.md`, `README.md`.

---

## Pre-Flight topology (code + docs)

Documented in `ARCHITECTURE.md` and implemented in `agent/preflight_agent.py`:

```text
GroundingDAG(ClipCandidate, Trend, Analytics)
  → LoopAgent(
       ParallelAgent(6 personas)
       → Aggregator
       → QualityGate
       → Refinement
     )
```

**Note:** Older docs claim FunctionTools for SerpAPI/YouTube Analytics. Audit found custom `BaseAgent` implementations more than FunctionTool-heavy editing tools. Re-verify tool wiring in `preflight_agent.py` before claiming FunctionTool parity in marketing.

Personas (weights referenced in code): genz, millennial, sports, tech, entertainment, news.

---

## Viral pipeline

`run_viral_pipeline` — Sequential segmentation + scoring; Redis cache tool; Gemini fallback `_direct_gemini_pipeline`.

Wired into `POST /api/pipeline/run` (JWT + credits) and analysis flows.

---

## Director / Script

- Director: ADK storyboard JSON (`DirectorResult`).  
- Script: non-ADK helper for script enhance / stock / TTS paths (ADK UI Coming Soon).  
- `action_models.py` contains `QepPatch` / `DirectorOutput` catalogue — **approval-gated schema**; not the live editor apply path.

---

## Agent runtime health

`routers/agent_runtime_router.py` + `services/agent_runtime.py` `ensure_agent_ready`.

Used by AI editor to soft-check readiness.

---

## Studio target agent map

| Agent | Responsibility | Maps from today |
|-------|----------------|-----------------|
| AnalysisAgent | Multimodal index on load | Extend viral + face/scene/whisper signals |
| SuggestionAgent | Dynamic chips | Replace static maps |
| OrchestratorAgent | Plan/execute/verify | Evolve `ai_editor_agent` |
| PreflightAgent | Publish gate | Keep |
| RenderAgent | Bake | Keep `render_worker` |
| AssetAgent | B-roll/TTS/stock | Script + broll_router |

---

## Guardrails (keep)

From scaffolds — retain:

- No actions beyond `videoDuration`  
- No credential leakage in messages  
- Soft fallbacks on SerpAPI/OAuth failure  
- Render duration limits  
- Credit gates on paid AI paths
