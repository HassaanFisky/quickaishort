# 01 — Product Vision (Source of Truth)

**Working product name:** QuickAI Short  
**Platform evolution:** QuickAI Studio  
**Positioning:** Conversational AI video editing — not another one-click clipper.

---

## Relationship

**QuickAI Short** is what ships in production today.

**QuickAI Studio** is the intentional evolution of QuickAI Short into an AI-native video editing operating system — same repository, same lineage, deeper orchestration.

Never present them as unrelated products.

---

## Definition

QuickAI Short / Studio is where:

- The **user is the director** (conversation and intent).
- The **AI is the editor** (tool selection and execution).
- The **backend/frontend tools are the craft** (real edits).
- The **timeline is secondary context**, not the only control surface.

The AI does not pretend to edit. It performs editing operations through tools registered in the Capability Registry (EP-001).

---

## Core philosophy

Every meaningful action should be reachable through conversation.

The user states intent. The system:

1. Understands intent  
2. Selects capabilities  
3. Orders execution  
4. Sets parameters  
5. Chooses assets / pipeline / render strategy  
6. Verifies result  
7. Reports in plain language  

---

## Canonical user flow (target + partial production)

```text
Upload / paste YouTube URL
        ↓
Ingest + transcription (+ MediaGraph facets as available)
        ↓
Contextual suggestions above chat (MediaGraph-grounded)
        ↓
User clicks suggestion OR types natural language
        ↓
Orchestrator / AI editor plans tool sequence
        ↓
Tool runtime executes (client NLE preview + server bake as needed)
        ↓
Timeline / preview update
        ↓
Export via RenderManifest / Kernel snapshot → ffmpeg worker → GCS
```

### Suggestions

Examples (illustrative): Remove pauses · Faster pacing · Cinematic captions · Convert to Shorts · Fix silence · Reframe speaker · Better hook

**Rule:** Suggestions are **MediaGraph-grounded** (ADR-009). Static heuristic lists are not the sole source. Phase 2 overturned “heuristics may seed alone.”

---

## AI architecture intent

The AI is an **orchestration engine**, not a novelty chatbot.

It must understand available tools, cost/latency, project context, user intent, and recovery. Behavior bar: senior professional editor.

**Gemini-first.** Google ADK deepens multi-agent orchestration (Pre-Flight today; broader OS orchestration on the roadmap). Do not claim unfinished ADK product surfaces as live.

---

## Frontend philosophy

Closer to a focused conversational workspace than Premiere density by default.

- Conversation primary  
- Timeline contextual  
- Panels appear when needed  
- **ADK** (Google Agent Development Kit) workspace: **Coming Soon** — blurred — intentionally hidden until release — **not** advertisements (see `EP-008-ADK-ARCHITECTURE-CORRECTION.md`)

---

## Pre-Flight

Pre-Flight multi-agent audience simulation remains a differentiated **capability / skill** (`skill.preflight` direction in Phase 2). It is not the entire product identity.

---

## Relationship to root VISION.md

Root [`VISION.md`](../../VISION.md) mirrors this document for public/product framing. For frozen architecture decisions, Phase 2 + ADRs win.

| Topic | Production (QuickAI Short) | Evolution (QuickAI Studio) |
|-------|----------------------------|----------------------------|
| Metaphor | Conversational long→short editor | AI-native editing OS |
| UI primacy | Chat + preview + timeline | Chat primary, timeline visualization |
| AI role | Structured edit actions + Pre-Flight skill | Full tool orchestration + deeper ADK |
| Storage | GCS primary | Unchanged contract (ADR-002) |

---

## Non-goals

- Pure generative “text→fake video” as the core product  
- Replacing Gemini with OpenAI/Anthropic for core challenge-critical logic  
- GPL dependencies that force proprietary disclosure  
- Big-bang rewrite of FastAPI/Next.js  
- Documenting Coming Soon surfaces as shipped  

---

## Success criteria

1. Meaningful edit session without requiring Advanced panels.  
2. Chat commands map to executed tools with undo where applicable.  
3. Suggestions update from MediaGraph after analysis/edits.  
4. Export uses validated RenderManifest / Kernel bake when required.  
5. Docs match code: shipped vs roadmap always explicit.  
