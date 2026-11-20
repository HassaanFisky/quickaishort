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


---

## Founder target: nine logical responsibility domains (2026-11-20)

These are target responsibility domains, not a claim that nine separate production agents currently exist. Do not create nine always-on paid models. Use on-demand specialist services/tools or shared-model roles behind one orchestrator wherever more efficient.

| Domain | Reuses / extends | Authority boundary |
|---|---|---|
| Orchestrator / Decision Director | ADR-010 + ADR-016 | Classifies ACT/ASK/RESEARCH/SIMULATE/DEFER/NO-OP; cannot self-authorize |
| Media Intelligence | Ingest, Whisper, MediaGraph | Read-only, tenant-scoped, evidence provenance |
| Creative Director | DecisionRecord + grounded suggestions | Proposes a plan; cannot claim execution |
| Editing Executor | EP-001 + EP-002 + EP-004 | Registered, sanitized, authorized capabilities only |
| Quality Verifier | Kernel readback, Manifest/export validation | Independently checks outcome; can block delivery |
| Finance Controller | Existing billing routes and credit guard + future ledger | Deterministic entitlements/ledger; no unrestricted bank access |
| Growth & Partnerships | Future partner/campaign/attribution services | Drafts and measures; no unapproved spend or external promises |
| Security & Trust | Auth, CostGuard, storage and audit controls | Deterministic enforcement; cannot grant itself permissions |
| Product Intelligence | Future minimized product telemetry | Editing preferences and UX friction only; no sensitive psychological profiling |

### Current finance implementation boundary

Billing router currently contains Paddle, Stripe and LemonSqueezy webhook routes, while the plan catalogue is Paddle-oriented. This is not proof of a provider-neutral billing system, financial accounting ledger, settlement reconciliation or payout manager. See document 43.

### Execution truth invariant

A generated plan, accepted plan, tool call, Kernel acknowledgment, rendered file and verified user outcome are separate lifecycle states. Persist and attribute each transition. Never report a later state without evidence.
