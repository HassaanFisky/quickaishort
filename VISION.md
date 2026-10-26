# Vision — QuickAI Short → QuickAI Studio

**Last updated:** 2026-10-26  
**Authority:** Aligns with [`docs/studio/01-product-vision.md`](docs/studio/01-product-vision.md) and [`docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md`](docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md).

---

## Mission

Give creators a way to turn long-form video into finished short-form content by **directing edits in natural language** — without pretending the product is a one-click clip factory.

The AI performs editing operations. The user owns creative intent.

---

## Product lineage

| Name | Status | Meaning |
|------|--------|---------|
| **QuickAI Short** | Origin | Original short-video product line and deployment domain ([quickaishort.online](https://www.quickaishort.online)) |
| **QuickAI Studio** | Current Identity | AI-native conversational video editing platform built on the unified codebase |

Studio is not a second product. It is the evolved product identity and operating-system architecture of QuickAI Short: capability registry, server-authoritative project documents, MediaGraph-grounded suggestions, orchestrator plan jobs, local-first execution engine, and chat-primary UX.

---

## What we believe

1. **Conversation is the control plane.** Creators should state intent; the system selects and runs tools.
2. **The AI must actually edit.** Structured actions applied to a real timeline — not marketing copy that claims “AI editing.”
3. **Timeline is visualization.** It shows decisions; it is not required as the primary UI for every task.
4. **Pre-Flight is a skill.** Audience simulation via Google ADK agents is a powerful capability — not the homepage identity.
5. **Gemini-first + Local-first capable.** Cloud AI uses Gemini 2.5 Flash; local-first mode runs zero-spend deterministic planning or local Ollama models with native FFmpeg.
6. **Cost is an acceptance criterion.** Prefer bounded, deduplicated, scale-to-zero-friendly designs without sacrificing reliability.

---

## Today (implemented)

- YouTube URL or local file upload via staged ingest FSM
- Browser Whisper transcription + server/local FFmpeg media probe
- Conversational AI editor → structured edit actions → live preview
- MediaGraph-grounded suggestions and deterministic director loop
- Hybrid export: Cloud Tasks → private request-bound ffmpeg renderer → GCS, plus local-first native FFmpeg + SQLite execution mode
- Studio Kernel APIs (`/api/studio/v1/*`) for server-authoritative Project Documents, MediaGraph, and Orchestrator plans
- Pre-Flight multi-agent validation available as a pipeline capability

---

## Tomorrow (Studio OS roadmap)

- Deeper media understanding and multi-step plan orchestration
- Native Gemini tool-loop depth (ADR-006 path)
- ADK workspace UI released when ready (today: Coming Soon / blurred per ADR-013)
- Timeline remains secondary to chat for most edit sessions
- Optional multiplayer only with explicit founder approval

---

## Non-goals

- Pure text-to-fake-video generator as the core product
- Replacing Gemini with OpenAI/Anthropic for challenge-critical AI paths
- Marketing unfinished surfaces as live
- Big-bang rewrite of FastAPI / Next.js

---

## Success criteria

1. A creator can complete a meaningful edit session through conversation.
2. Every accepted command maps to executed tools with undo where applicable.
3. Suggestions stay grounded in MediaGraph — not static heuristic lists.
4. Export remains reliable, cancellable, and cost-bounded.
5. Documentation always separates **shipped** from **roadmap**.

---

## Related docs

- [`docs/studio/01-product-vision.md`](docs/studio/01-product-vision.md) — Studio target detail  
- [`docs/studio/17-roadmap.md`](docs/studio/17-roadmap.md) — execution status  
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system map  
- [`README.md`](README.md) — public product overview  
