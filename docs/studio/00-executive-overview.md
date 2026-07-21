# 00 — Executive Overview

**Date:** 2026-07-21 (documentation sync)  
**Product today:** QuickAI Short  
**Evolution:** QuickAI Studio (AI-native editing OS on the same codebase)

---

## One-sentence verdict

QuickAI Short is a **production conversational AI video editor** (ingest → chat-driven edits → preview → GCS export) with a **Studio Kernel substrate already dual-running** — and it is **not yet** a fully headless Premiere-class OS with native Gemini tool-loop depth or a released ADK workspace UI.

---

## What exists (verified production)

| Capability | Evidence |
|------------|----------|
| Next.js 14.2.35 editor | `frontend/package.json`, `frontend/src/app/editor/` |
| Conversational AI panel + MediaGraph suggestions | `AIPanel.tsx`, Studio media-graph APIs |
| AI → structured actions → timeline apply | `ai_editor_router.py`, Capability Registry, `editorStore` |
| Studio Kernel (projects, orchestrator, bake) | EP-002…006; flags `STUDIO_PROJECT_KERNEL` / `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL` |
| ADK Pre-Flight / Viral / Director agents (backend) | `fastapi/agent/*.py` |
| RQ render + DLQ + cancel + runId | `render_worker.py`, render status APIs |
| GCS primary media | ADR-002; `services/db.py` |
| NextAuth JWT backend auth | `fastapi/services/auth.py` |
| Editor first-run ingest + onboarding | EP-008 / ADR-013 |
| ADK UI Coming Soon gate | `/adk` blurred — not live wizard |

---

## What does not exist yet (roadmap — do not market as shipped)

| Vision item | Reality |
|-------------|---------|
| Full native Gemini function-calling tool loop | Prompt/JSON + registry path today; ADR-006 depth optional |
| Released ADK creator workspace UI | **Coming Soon** only |
| Multiplayer collaboration | EP-007 design-locked — founder approval required |
| Unified multimodal Analysis Agent (all facets) | Partial facets via MediaGraph / workers — not one mega-agent |

---

## Strategic recommendation

**Evolve, do not rewrite.**

Preserve: conversational editor, Capability Registry (EP-001 frozen), Project Document, MediaGraph suggestions, RQ + GCS export, Pre-Flight as skill.

Add carefully: native tool-loop depth, richer analysis, ADK workspace when product-ready.

---

## Risk summary

| Risk | Note |
|------|------|
| Doc drift (historical GridFS-primary / live ADK Studio claims) | Root docs realigned 2026-07-21; keep this tree authoritative |
| Gemini quota / prepayment | Ops blocker — not an architecture defect |
| Action vocabulary vs executable coverage | Registry + sanitiser gates; never bypass EP-001 |

---

## Reading order

1. This page  
2. [`01-product-vision.md`](./01-product-vision.md)  
3. [`PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md`](./PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md)  
4. [`CANONICAL_PROJECT_MEMORY.md`](./CANONICAL_PROJECT_MEMORY.md)  
5. [`ROADMAP.md`](./ROADMAP.md)  
6. Subsystem docs as needed  
