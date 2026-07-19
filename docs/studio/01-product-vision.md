# 01 — Product Vision (Source of Truth)

**Product name:** QuickAI Studio  
**Former name:** QuickAI Shorts  
**Positioning:** AI-native professional video editing platform — **not** another AI video generator.

---

## Definition

QuickAI Studio is where:

- The **user is the director** (conversation).
- The **AI is the editor** (tool orchestration).
- The **backend/frontend tools are the craft** (real edits).
- The **timeline is secondary context**, not the primary UI.

The AI never pretends to edit. It performs editing operations through tools.

---

## Core philosophy

Every action should be reachable through conversation.

Instead of hunting hundreds of buttons, the user states intent. The AI:

1. Understands intent  
2. Selects tools  
3. Orders execution  
4. Sets parameters  
5. Chooses assets / pipeline / render strategy  
6. Verifies result  
7. Reports in plain language  

---

## Canonical user flow

```text
Upload / paste YouTube URL
        ↓
AI Analysis Agent (video, audio, faces, scenes, pacing, silence,
                   captions, objects, emotion, quality, composition, metadata)
        ↓
Dynamic contextual suggestions above chat input
        ↓
User clicks suggestion OR types natural language
        ↓
Orchestrator plans tool sequence
        ↓
Tool Runtime executes (client NLE + server bake as needed)
        ↓
Timeline / preview update
        ↓
Optional export via RenderManifest → ffmpeg worker
```

### Example suggestions (illustrative — must be dynamic)

Remove pauses · Make faster · Improve storytelling · Cinematic captions · Convert to Shorts · Remove filler · Add zooms · Better hook · Fix silence · Viral pacing · Transitions · Enhance audio · Reframe speaker · Highlight best moments

**Rule:** Not hardcoded static lists as the sole source. Heuristics may seed; analysis must refine.

---

## AI architecture intent

The AI is an **orchestration engine**, not a chatbot.

It must understand:

- available tools + dependencies + order  
- cost + latency  
- context + previous edits + timeline state  
- user intent + editing history  
- recovery + verification  

Behavior bar: **senior professional editor**.

---

## Backend philosophy

Headless professional NLE capabilities exposed as **tools**:

timeline edit · split · trim · ripple · overlays · subtitles · transitions · keyframes · audio cleanup · ducking · reframe · effects · export · render · proxies · metadata · FFmpeg pipelines · media indexing · asset management

User does not call these APIs. The agent does.

---

## Frontend philosophy

Closer to ChatGPT than Premiere UI density.

- Conversation always primary  
- Timeline contextual  
- Panels appear when needed  
- Clean, premium, low noise  
- **ADK** (Google Agent Development Kit workspace): remain blurred with clear **Coming Soon** + reserved IA skeleton — do not expose unfinished agent orchestration; **not** an advertisements/marketing page (see `EP-008-ADK-ARCHITECTURE-CORRECTION.md`) 

---

## Relationship to existing VISION.md

Root `VISION.md` describes **QuickAIShort.online** as YouTube→viral shorts with Pre-Flight differentiation and a 2026 challenge roadmap.

| Topic | Root VISION.md | Studio vision (this doc) |
|-------|----------------|--------------------------|
| Primary product metaphor | Shorts repurposing + Pre-Flight | Conversational professional editor |
| UI primacy | Dual control (auto + manual) | Chat primary, timeline secondary |
| AI role | Copilot + audience simulation | Orchestration engine operating tools |
| Roadmap framing | v1–v3 shorts features | Studio NLE + agent runtime |

**Decision:** This document supersedes root `VISION.md` for product direction. Keep Pre-Flight as a **Studio capability**, not the sole identity.

---

## Non-goals

- Pure generative “text→fake video” product  
- Replacing Gemini with OpenAI/Anthropic for core logic (challenge eligibility / stack lock)  
- GPL dependencies that force proprietary disclosure  
- Big-bang rewrite of FastAPI/Next.js  

---

## Success criteria (Studio MVP)

1. User can complete a meaningful edit session **without opening Advanced panels**.  
2. Every chat command maps to **executed** tools with undo.  
3. Suggestions update after analysis and after each edit.  
4. Export uses a validated `RenderManifest` when multi-clip/effects require bake.  
5. Docs in `docs/studio/` match code (CI doc-lint optional later).
