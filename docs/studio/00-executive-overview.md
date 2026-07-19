# 00 — Executive Overview

**Date:** 2026-07-18  
**Product rename target:** QuickAI Shorts → **QuickAI Studio**  
**Audit method:** Repository file reads + greps. No invented APIs.

---

## One-sentence verdict

QuickAI is a **production-capable YouTube-to-Shorts + Pre-Flight + conversational AI editor** whose AI layer already returns structured edit actions and applies them in the browser store — but it is **not yet** a headless Premiere-class orchestration engine with server-authoritative timeline tools, native function calling, or fully dynamic multimodal analysis.

---

## What exists (verified)

| Capability | Evidence |
|------------|----------|
| Next.js 14.2.35 App Router editor | `frontend/package.json`, `frontend/src/app/editor/page.tsx` |
| Conversational AI panel + suggestion chips | `frontend/src/components/editor/AIPanel.tsx`, `frontend/src/lib/gemini-editor.ts` |
| AI → JSON actions → Zustand apply | `fastapi/routers/ai_editor_router.py`, `frontend/src/hooks/useAiCommander.ts`, `editorStore.applyAiEdits` |
| Large action vocabulary (trim, split, captions, filters, ripple enums, etc.) | `fastapi/models/ai_editor.py`, `frontend/src/lib/aiToolCatalog.ts` |
| ADK Pre-Flight / Viral / Director agents | `fastapi/agent/preflight_agent.py`, `viral_agent.py`, `director_agent.py` |
| RQ render worker + DLQ + cancel + runId | `fastapi/render_worker.py`, `services/render_queue.py` |
| GCS primary media | `fastapi/services/db.py`, ADK upload + export paths in `main.py` |
| NextAuth JWT backend auth | `fastapi/services/auth.py` |
| RenderManifest schema (FE + BE) | `frontend/src/lib/render/renderManifest.ts`, `fastapi/models/render_manifest.py` |
| Partial manifest → ffmpeg compile | `fastapi/services/manifest_renderer.py` used in `render_worker.py` |
| Multi-track timeline UI | `frontend/src/components/editor/MultiTrackTimeline.tsx`, `BottomDock.tsx` |
| Advanced panels gated by `?advanced=1` | `EditorLayout.tsx` (`isAdvancedMode`) |

---

## What does not exist (verified gaps vs Studio vision)

| Vision requirement | Reality |
|--------------------|---------|
| AI never pretends — operates real editing tools via function calling | Prompt lists tools; Gemini returns JSON via `generate_content`. Native `FunctionDeclaration` / tool loop: **not present** in `ai_editor_engine.py` / `gemini_client.py` |
| Backend = headless Premiere engine | Export/ffmpeg + action schemas. No server timeline mutation API / authoritative multi-track graph DB |
| Chat is primary interface | AI panel exists; default layout still canvas + dock timeline; advanced left/right panels optional |
| Fully dynamic suggestions from deep analysis | **MediaGraph grounded suggestions** in editor; multimodal depth still partial (faces/scenes not unified AnalysisAgent) |
| Auto multimodal analysis on upload (faces, scenes, emotion, objects…) | Partial: Whisper (browser), face tracker hook, scene/beat detection libs — **not** a unified post-upload agent analysis pipeline |
| ADK (Agent Development Kit) Coming Soon | **Product lock:** ADK ≠ Ads. Spec: `EP-008-ADK-ARCHITECTURE-CORRECTION.md`. Pricing Agency “Coming Soon” is unrelated billing UX |

---

## Strategic recommendation

**Evolve, do not rewrite.**

Preserve:
- Zustand as interactive NLE truth for preview
- `applyAiEdits` / undo stacks
- RQ + GCS export path
- ADK Pre-Flight as differentiation
- RenderManifest as the long-term bake contract

Add (blueprint order in `28-implementation-blueprint.md`):
1. Unify tool catalogue (FE catalog ↔ BE models ↔ Gemini tools)
2. Native Gemini function calling + planner/executor loop
3. Server Tool Runtime for long-running ops (silence removal bake, export, B-roll fetch)
4. Chat-primary default UX (timeline contextual)
5. Analysis Agent → dynamic suggestion rail
6. Deprecate dual AI endpoints / dual storage naming drift

---

## Risk summary

| Risk | Level | Note |
|------|-------|------|
| Architectural drift in docs (`CLAUDE.md` firebase_auth, GridFS-as-primary notes) | High | Misleads agents |
| Ops: FE Kernel flag not set on Vercel | Medium | Kernel path stays client-only until flag on |
| Action vocabulary ≠ executable coverage | High | AI may emit unsupported tools |
| Dual RQ + Celery paths | Medium | Maintainability |
| Cost (Gemini per command + credits) | Medium | Needs caching / local tools |

---

## Reading order for AntiGravity

1. This page  
2. `01-product-vision.md`  
3. `27-validation-report.md`  
4. `06-ai-architecture.md` + `07-agent-architecture.md`  
5. `28-implementation-blueprint.md` (execute tasks from here)
