# PHASE 2 — Architectural Truth Review

**Document type:** Definitive engineering decision record  
**Product:** QuickAI Studio (evolution of QuickAI Short)  
**Date:** 2026-07-18  
**Audience:** Founder, AntiGravity agents, future staff engineers  
**Prerequisite knowledge:** Entire `docs/studio/` tree (Phase 1 audit platform)  
**Scope:** Product architecture decisions only — not a re-audit, not a doc regen  

---

## Governing rule for this document

| Layer | Authority |
|-------|-----------|
| Intended product (below) | **Tomorrow — overrides implementation when choosing direction** |
| `docs/studio/` Phase 1 platform | **Today’s map** — use for evidence of what exists |
| Implementation code | **Present constraint** — evolve through it; do not idolize it |

Wherever Phase 1 ADRs or cost notes conflict with the intended operating system, **this document supersedes them**.

---

## Intended product (locked)

QuickAI Studio is an **AI-native video editing operating system**.

- Interaction metaphor: **ChatGPT / Cursor / Claude** (conversation is the control plane)
- Execution metaphor: **professional NLE** (deterministic tools, not generative pretend)
- Role split: **User = director · AI = editor · Tools = craft**
- Timeline: **one visualization of editing decisions**, not the primary work surface
- Suggestions: **only from media understanding** — never from keyword heuristics as product truth

---

# Part A — Answers to the twelve architecture questions

## 1. Can the current architecture realistically evolve into this product?

**Yes — with a hard pivot in mental model, not a greenfield rewrite.**

The stack already contains the three load-bearing primitives an editing OS needs:

1. A **structured edit vocabulary** and sanitiser gate (`ai_editor` models + sanitiser + `applyAiEdits`)
2. A **portable composition contract** (`RenderManifest` FE↔BE + partial ffmpeg compile)
3. An **async bake/worker plane** (RQ + runId + DLQ + GCS)

What is missing is not “another Next.js app.” What is missing is an **Operating System kernel**: Media Understanding Graph → Intent → Tool Orchestrator → Event-sourced Project Document → Projections (chat, timeline, preview, export).

**Decision A1 — Evolve via strangler, forbid rewrite of FastAPI/Next.js/RQ.**  
Replace *roles* of subsystems; keep *processes* and *storage planes* unless they block the OS kernel.

---

## 2. Which existing systems should remain unchanged?

**Decision A2 — Freeze these as durable infrastructure (API shape may grow; core role stays):**

| System | Why it survives |
|--------|-----------------|
| Next.js App Router + Zustand preview surface | Instant projection of edit events; Cursor-like local feel |
| NextAuth JWT → `get_verified_user_id` | Correct auth plane (Phase 1 validated) |
| GCS as blob store | Correct media plane |
| Firestore as product DB host | Correct place for Project Documents / analysis / credits |
| Redis + RQ render worker + DLQ + cancel/runId | Correct long-job plane for bake |
| ADK Pre-Flight as a **callable capability** | Product moat — becomes a tool, not the product identity |
| Viral / Director / Script agents as **specialist modules** | Reusable agent library under one orchestrator |
| `RenderManifest` as export/bake IR | Becomes the composition snapshot format |
| Sanitiser + credit gates | Mandatory trust boundary for any tool plan |

Do **not** replace these for aesthetic reasons.

---

## 3. Which systems require architectural evolution?

**Decision A3 — Evolve in place (same files grow new contracts):**

| System | Evolution required |
|--------|-------------------|
| `ai_editor_engine` / commander path | From “JSON reply chatbot” → **multi-step tool orchestrator** with plan, execute, verify, recover |
| `gemini_client` | From content-only → **native tool/function-call host** (ADR-006 remains directionally correct) |
| `aiToolCatalog` + `models/ai_editor.py` | From dual dialects → **capability registry** with discovery, cost, side-effects, exec locus |
| `editorStore` | From sole timeline authority → **projection + optimistic applicator** of Project Events |
| `EditorLayout` / `AIPanel` | From editor-with-chat → **chat-primary OS shell**; timeline as inspector |
| `useMediaPipeline` + face/scene/beat libs | From fragmented hooks → **Analysis pipeline feeding a Media Graph** |
| Suggestion rail (`generateImmediateSuggestions`) | From heuristics → **Suggestion Engine bound to Media Graph only** |
| `project_service` / projects API | From script/status bags → **versioned Project Document + event log** |
| `manifest_renderer` | From partial compile → **primary bake compiler** for non-trivial compositions |
| Agent scaffolds / runtime health | From five named agents → **Agent runtime with reusable workflows** |

---

## 4. Which systems require complete replacement?

**Decision A4 — Replace these concepts (not necessarily every file overnight):**

| Concept to retire | Replacement |
|-------------------|-------------|
| **Heuristic title→suggestion maps as product behavior** (`INSTANT_SUGGESTIONS` / static `WITH_VIDEO_SUGGESTIONS`) | Media-Graph-backed Suggestion Engine. Heuristics may only power a non-actionable “Analyzing…” skeleton UI — never clickable creative recommendations. |
| **Prompt-stuffed full tool lists as the scaling model** | Capability registry + retrieval of relevant tool schemas per turn (see Q9) |
| **“AI message that describes edits” without a ToolResult receipt** | Every user-visible success must cite executed tool IDs + event IDs |
| **Browser-authoritative Project truth as the multi-year end state** (ADR-001 as permanent law) | **Supersede ADR-001 end-state**: client remains latency layer; **server Project Document is authoritative** for persistence, collaboration, automation (see Q10) |
| **Product identity = Pre-Flight / Shorts clip factory** | Identity = Studio OS; Pre-Flight = tool |
| **Dual AI prompt dialects as permanent coexistence** | Single registry-generated contract; one dialect dies |
| **Celery + GridFS as a parallel product path** | Freeze → deprecate → remove after traffic proof (not a rewrite of the main OS) |

No recommendation to replace Next.js, FastAPI, Gemini, GCS, or RQ wholesale.

---

## 5. Which assumptions inside the documentation are technically incorrect?

These are **incorrect relative to the intended product**, even if they were pragmatic for Phase 1 shipping:

| Doc assumption | Why it is wrong for Studio OS | Correct decision |
|----------------|-------------------------------|------------------|
| `01-product-vision.md`: “Heuristics may seed; analysis must refine” | Intended model forbids hardcoded/heuristic recommendations as creative truth | **Decision A5a:** Clickable suggestions **must** derive from Media Graph nodes. Until analysis yields nodes, show progress — not fake advice. |
| `06-ai-architecture.md` / `29-cost-and-oss-policy.md`: Prefer instant heuristic suggestions for cost | Cost optimization leaked into product semantics | **Decision A5b:** Cost control = cache Media Graph + tiered analysis depth — **not** fake chips. |
| ADR-001 end-state: client-side NLE as primary truth indefinitely | Blocks collaboration, automation, reusable workflows, server agents | **Decision A5c:** ADR-001 remains valid for **preview latency only**. Authoritative state migrates to server Project Document. |
| Blueprint Phase S2 framing chat layout as “mostly CSS/IA” | Necessary but insufficient — without Media Graph + orchestrator, ChatGPT-shell is cosplay | **Decision A5d:** Chat-primary UI ships **only after** Suggestion Engine is bound to analysis (or ships behind flag with empty rail + analyzing state). |
| Treating `applyAiEdits` success as proof of “AI operating system” | That path is still **assistant → patch list → store** | **Decision A5e:** OS bar = orchestrator loop with tool receipts, dependency order, verification, rollback events. |
| Implying RenderManifest “partial today” is fine as end architecture | Partial IR becomes a fidelity ceiling | **Decision A5f:** Manifest completeness is a **P0 platform KPI**, not a render nice-to-have. |
| “Hundreds of tools” via expanding Pydantic unions + system prompts | Context window and drift explode | See Decision A9 |

Phase 1 facts about *today’s code* remain accurate; Phase 1 *prescriptions* that preserve assistant semantics are what this review overturns.

---

## 6. Which implementation decisions will become bottlenecks at scale?

**Decision A6 — Treat these as known scaling cliffs; design around them now:**

| Bottleneck | Failure mode | Architectural countermeasure |
|------------|--------------|------------------------------|
| Sync AI edit ≤ ~30s hard timeout | Multi-tool plans die mid-flight | **Async Plan Jobs** with stream of ToolEvents; chat subscribes |
| Entire transcript / state in every prompt | Cost + truncation stupidity | **Media Graph summaries + windowed evidence packs** |
| Prompt listing all tools | Breaks at ~50–100 tools | **Tool retrieval / capability routing** |
| Zustand-only project | Cannot sync devices or agents | **Event-sourced Project Document** |
| Export option-bag divergence from Manifest | Silent preview≠export | **Manifest-only bake path for Studio exports** |
| Per-command full Gemini without plan cache | Margin death | Plan templates + deterministic tools for mechanical ops |
| Client multimodal hooks without server index | Recompute every session; no automation | Persist Analysis Artifacts beside media in GCS/Firestore |
| Dual queues / dual AI endpoints | Operational entropy | One orchestrator entry; one bake queue |

---

## 7. Which parts are still “AI assistant” thinking instead of “AI operating system” thinking?

**Decision A7 — Explicit reclassification:**

| Assistant pattern (retire) | OS pattern (adopt) |
|----------------------------|--------------------|
| User asks → model answers with JSON patches | User directs → **kernel schedules tools** |
| Suggestions as UX sugar | Suggestions as **intents compiled from understanding** |
| Chat panel beside Premiere UI | **Conversation is the control plane**; canvas/timeline are monitors |
| Agents as separate product features (Viral, Pre-Flight, ADK wizard) | Agents as **installable skills** on one runtime |
| Credits deducted per chat message | Credits tied to **tool plan cost model** (analysis vs edit vs bake) |
| Undo as local stack only | Undo as **revert Project Events** (local stack mirrors server) |
| “Message: Done” without receipt | **ToolResult + EventId** always |

If a feature can ship without writing a ToolResult to the Project Document, it is still assistant chrome.

---

## 8. Does the current AI architecture truly support autonomous tool orchestration?

**No — not as an operating system.**

It supports **one-shot structured generation** of action arrays with client application. That is a strong **Step-0 compiler**, not autonomous orchestration.

Missing OS properties (all required):

- Native multi-step tool loop with intermediate observation
- Explicit dependency graph / parallel vs sequential scheduling
- Intermediate validation gates
- Rollback as first-class tool outcome
- Incremental render strategy selection
- Long-running tool awaiting with user-visible progress in chat

**Decision A8 — Orchestrator contract (mandatory):**

```text
Intent
  → Plan (ordered ToolCalls + deps + cost estimate)
  → Execute (ClientTool | ServerTool | RenderTool)
  → Observe (ToolResult)
  → Verify (invariants on Project Document)
  → Commit Event | Rollback
  → Narrate (chat) + Refresh suggestions
```

ADR-006 (native function calling) is **necessary but not sufficient**. Function calling without Plan Jobs, receipts, and verification is still an assistant.

---

## 9. Is there enough abstraction for hundreds of editing tools?

**No.**

Today’s abstraction is: large unions + catalogs + prompts. That scales linearly into context and maintenance cost.

**Decision A9 — Capability Registry architecture:**

Each tool is a capability record:

- `id`, `version`, `schema` (JSON Schema)
- `side_effects`: `preview | mutate_project | network | bake | billing`
- `exec_locus`: `client | server | worker`
- `cost_class`, `latency_class`, `idempotent`, `parallel_safe`
- `requires`: media graph facets (e.g. needs `transcript`, `faces`)
- `inverse` / `compensating_tool` for rollback when possible

Orchestrator never loads hundreds of full schemas. It:

1. Classifies intent → capability tags  
2. Retrieves top-K tool schemas  
3. Plans only with those  
4. Sanitiser validates against registry versions  

**Future architecture recommendation:** Generate FE types + Gemini declarations from the registry in CI — one source of truth (aligns with blueprint T-1.1, but elevates it from “DRY prompts” to **OS ABI**).

---

## 10. Is the editor prepared for server-authoritative editing?

**Not yet — and Phase 1 ADR-001 must not freeze the wrong end-state.**

Today: browser Zustand is interactive authority; server mostly plans and bakes.

**Decision A10 — Dual-layer state model (the correct multi-year design):**

| Layer | Role | Technology direction |
|-------|------|----------------------|
| **Project Document (authoritative)** | Ordered edit events + current Manifest snapshot | Firestore (or equivalent) document + append-only event collection |
| **Preview Projection (ephemeral)** | Optimistic UI, scrubbing, local undo mirror | Zustand applying events |
| **Bake Artifact** | Deterministic MP4 from Manifest | RQ + `manifest_renderer` → GCS |

Rules:

1. Chat tools that mutate composition **commit events** (client may optimistic-apply, then ack).  
2. Reload / second device / agent automation **replay or snapshot-load** from server.  
3. Export **never** trusts an unsynced local-only store as sole source.  
4. Collaboration becomes possible only after (1)–(3).

This is **evolution**, not replacing Zustand. Zustand becomes a projector — the Figma-like pattern — rather than the database.

**Supersedes ADR-001 end-state.** ADR-001’s latency rationale remains accepted for preview.

---

## 11. Can this architecture support collaboration, reusable workflows, reusable agents, templates, automation?

**Not with today’s authority model. Yes after Decision A10 + A8 + A9.**

| Capability | Blocker today | Required substrate |
|------------|---------------|--------------------|
| Collaborative editing | No shared event log / OT/CRDT story | Project Events + presence channel (Pusher already exists for export/stats — extend carefully) |
| Reusable workflows | Plans are ephemeral LLM outputs | **Workflow documents**: saved Plan templates with tool graphs |
| Reusable agents | Agents are code modules, not installable skills | Agent manifests referencing allowed capability sets |
| Templates | Project templates exist as FE starters | Templates = seed Manifest + seed Media Graph expectations |
| Future automation | No headless session that mutates Project Document | Server Orchestrator run keyed by `project_id` without browser |

**Decision A11 — Platform objects (name them in the product ABI):**

1. `MediaAsset`  
2. `MediaGraph` (understanding)  
3. `ProjectDocument` + `ProjectEvent`  
4. `Capability` (tool)  
5. `Plan` / `Workflow`  
6. `AgentSkill`  
7. `RenderManifest` / `BakeJob`  

Anything that cannot be expressed as these objects is a UI flourish, not platform.

---

## 12. What would leading AI-native / craft companies almost certainly do differently?

These are **Future architecture recommendations** informed by industry patterns — not claims about their private systems.

| Org pattern | What they optimize | Implication for QuickAI Studio |
|-------------|--------------------|--------------------------------|
| **Cursor** | Conversation as primary IDE; tools apply real patches; composer multi-file | Chat is control plane; tools must mutate real Project Events, not “advice” |
| **OpenAI / Anthropic** | Agents = tool loops with observation | One-shot JSON is a prototype; loops are the product |
| **Google DeepMind / Gemini-native** | Multimodal understanding as first-class context | Media Graph must be multimodal artifacts, not transcript-only bags |
| **Figma** | Multiplayer + CRDT/eventual projections; UI is a view | Server authority + local projection (Decision A10) |
| **Linear** | Issues/commands as structured objects; keyboard/chat density without panel chaos | Intents and workflows as objects; not 40 inspector tabs |
| **Vercel** | Preview ≠ production; immutable artifacts | Preview projection vs bake artifact separation — already partially true; make it law |
| **Apple** | On-device privacy + progressive disclosure | Keep browser Whisper/face as **edge analysis**, sync summaries — don’t force all pixels through paid cloud first |
| **Against CapCut/Premiere clones** | They would not start from timeline-primary chrome | Studio must not “win” by adding more panels |

**Decision A12 — Competitive north star:** Compete with **Cursor-for-video**, not CapCut-with-a-chatbot.

---

# Part B — UI / interaction truth review

## Current UX posture vs intended experience

| Intended (ChatGPT / Cursor / Claude class) | Current Studio shell (from Phase 1 docs) | Verdict |
|--------------------------------------------|------------------------------------------|---------|
| Conversation dominates first viewport | AI panel exists; canvas + bottom dock dominate | **Traditional NLE remnants still win the default** |
| Timeline is a monitor | MultiTrackTimeline + BottomDock are core | Monitor not yet demoted |
| Suggestions = understanding | Heuristic chips + optional refine | **Fails intended bar** |
| Panels only when needed | `?advanced=1` helps, but default still editor-shaped | Partial credit |
| Unfinished features never look live | ADK = Google Agent Development Kit Coming Soon (not Ads); Agency “Coming Soon” on pricing is unrelated | See `EP-008-ADK-ARCHITECTURE-CORRECTION.md` |

**Decision U1 — Shell law:**

Default `/editor` (Studio) layout priority order:

1. Chat column (input + suggestion rail + receipts)  
2. Preview canvas (watch, don’t dig)  
3. Timeline dock (collapsed height by default; expands on demand)  
4. Advanced inspectors only via explicit mode  

Shipping chat-primary CSS **without** Media-Graph suggestions is **forbidden as a “Studio launch” claim**.

**Decision U2 — ADK workspace (product requirement lock):**

**ADK** = Google Agent Development Kit (not advertisements). When the ADK workspace is in navigation:

- Render behind `ComingSoonGate` (blur + professional “Coming Soon” + short subtitle)
- Reserved disabled/blurred IA skeleton (Agents, Workflows, Tools, Memory, Knowledge, MCP, Integrations, Automation)
- No live agent orchestration / network execution that looks finished
- Never ship as an Ads/marketing page

U2 is non-negotiable. See `EP-008-ADK-ARCHITECTURE-CORRECTION.md`.

**Decision U3 — Cognitive load:**

Reject new permanent panel chrome. New power features arrive as:

- chat skills, or  
- advanced-mode drawers, or  
- temporary tool cards inside the conversation  

Not as default sidebar entropy.

---

# Part C — Target OS architecture (decision, not audit)

```text
┌─────────────────────────────────────────────────────────────┐
│                     STUDIO CONTROL PLANE                     │
│   Chat · Suggestion Rail · Plan Progress · Tool Receipts     │
└───────────────────────────┬─────────────────────────────────┘
                            │ Intent
┌───────────────────────────▼─────────────────────────────────┐
│                     ORCHESTRATOR KERNEL                      │
│   retrieve capabilities → plan → schedule → verify → narrate │
└─────────────┬─────────────────────────────┬─────────────────┘
              │                             │
   ┌──────────▼──────────┐       ┌──────────▼──────────┐
   │   CAPABILITY RUNTIME │       │   MEDIA GRAPH SVC   │
   │ client|server|worker │       │ analysis artifacts  │
   └──────────┬──────────┘       └──────────┬──────────┘
              │                             │
   ┌──────────▼─────────────────────────────▼──────────┐
   │           PROJECT DOCUMENT (authoritative)         │
   │     events · manifest snapshot · workflow binds    │
   └──────────┬─────────────────────────────┬──────────┘
              │                             │
   ┌──────────▼──────────┐       ┌──────────▼──────────┐
   │ Preview Projection  │       │ Bake Job (RQ/GCS)   │
   │ (Zustand / canvas)  │       │ RenderManifest IR   │
   └─────────────────────┘       └─────────────────────┘
```

This is the architecture the documentation platform must now steer toward. Phase 1’s “evolve ai_editor + keep Zustand truth” was a correct **bridge**; it is not the **destination**.

---

# Part D — Binding engineering decisions (multi-year)

## D1 — Media Graph is mandatory product substrate

**Decision:** On asset load, Studio always starts an Analysis run that writes a versioned `MediaGraph` (facets may be sparse; absence is explicit, not faked).

Facets include, as available: transcript, silence, speakers/faces, scenes, pacing, quality issues, captions candidates, camera/motion summaries, brand/safe zones, creator-intent hints from user metadata.

**Suggestion chips bind only to graph-derived intents.**

## D2 — Conversation compiles to Plans, not to vibes

**Decision:** A chip click creates a structured `Intent` object (not a raw string forever). Free text is parsed into `Intent`. Orchestrator only accepts Intents.

## D3 — Tools are the ABI; models are replaceable

**Decision:** Gemini remains the default planner/reasoner for eligibility and cost. The ABI is the Capability Registry. Swapping models must not rewrite the NLE.

## D4 — Preview ≠ Bake, but both share Manifest IR

**Decision:** Optimistic preview may approximate; bake must compile Manifest. Drift between preview and bake is a P0 bug class.

## D5 — Pre-Flight becomes `skill.preflight`

**Decision:** Keep the ADK graph. Expose it as an AgentSkill/tool invoked from chat (“Will this retain?”), not as the homepage identity of Studio.

## D6 — Cost architecture without lying to users

**Decision:**

- Tier analysis: edge (browser) → server deepen → optional vision pass  
- Cache MediaGraph aggressively  
- Mechanical tools (`seek`, `play`, simple toggles) never call an LLM  
- LLM cost attaches to Plan creation and hard reasoning tools only  

Never use fake suggestions as a cost-saving strategy.

## D7 — What we will not build

- Generative “AI video generator” as the core loop  
- GPL copyleft NLE cores that force disclosure  
- Timeline-primary redesign that re-buries chat  
- Tooling that only updates chat text without Project Events  

---

# Part E — Decision impact on Phase 1 artifacts

| Phase 1 artifact | Status under Phase 2 |
|------------------|----------------------|
| `01-product-vision.md` interaction model | **Affirmed**; heuristic seeding clause **overturned by A5a** |
| ADR-001 | **Latency layer affirmed; end-state authority overturned by A10** |
| ADR-005 chat-primary | **Affirmed**; gated by U1/A5d |
| ADR-006 native FC | **Affirmed as necessary, insufficient alone (A8)** |
| ADR-004 RenderManifest | **Elevated to P0 platform KPI (A5f)** |
| `28-implementation-blueprint.md` task order | Still useful for execution, but **reinterpret**: T-3.x UI must not outrun Media Graph + Orchestrator kernel; treat registry (T-1.1) and analysis (T-4.1) as **OS blockers**, not polish |
| “Evolve, don’t rewrite” slogan | **Affirmed** — with the sharper meaning: rewrite *roles*, not *repos* |

---

# Part F — Definition of done for “we are building Studio OS”

Studio OS is real only when all are true:

1. Upload → MediaGraph persisted without user prompt  
2. Suggestion chips are graph-derived intents (no keyword creative chips)  
3. Chip/chat → Plan → ToolResults → ProjectEvents (receipts in UI)  
4. Timeline/canvas are projections of ProjectDocument  
5. Export compiles RenderManifest from authoritative snapshot  
6. Pre-Flight invocable as skill  
7. ADK workspace behind Coming Soon blur (not Ads)  
8. Default UX is chat-primary; advanced NLE chrome is opt-in  

Until then, marketing language must say **conversational editor transitioning to Studio OS** — not that the OS already exists.

---

# Part G — Single recommended sequencing (architecture, not task microcopy)

```text
1. Capability Registry ABI (stop dialect cancer)
2. ProjectDocument + Event commit path (authority)
3. MediaGraph analysis + Suggestion Engine (truthful chips)
4. Orchestrator Plan Jobs + native tool loop + verification
5. Chat-primary shell (now honest)
6. Manifest-complete bake
7. Workflows / AgentSkills / collaboration on top of events
```

Any sequence that ships (5) before (2)–(4) produces a prettier assistant, not an operating system.

---

## Final verdict

The Phase 1 documentation platform correctly mapped **today** and correctly forbade a rewrite. It under-specified the **destination OS** and allowed cost-driven heuristics and browser authority to be mistaken for product truth.

**QuickAI can become QuickAI Studio.**  
It will not get there by adding more Premiere panels or more chatbot polish.  
It gets there by installing an **editing operating system kernel** on top of the assets already earned: structured actions, Manifest IR, worker bake plane, ADK skills, and a chat surface waiting to become the control plane.

**This file is the binding architectural truth for that transition.**
