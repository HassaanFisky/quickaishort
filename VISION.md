# Vision — QuickAI Short → QuickAI Studio

**Last updated:** 2026-11-20  
**Authority:** Aligns with [`docs/studio/01-product-vision.md`](docs/studio/01-product-vision.md) and [`docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md`](docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md).

---

## Mission

Give creators a way to turn long-form video into finished short-form content by **directing edits in natural language** — without pretending the product is a one-click clip factory.

The AI performs editing operations. The user owns creative intent.

---

## Product lineage

| Name | Status | Meaning |
|------|--------|---------|
| **QuickAI Short** | Production | Conversational AI video editor live at [quickaishort.online](https://www.quickaishort.online) |
| **QuickAI Studio** | Evolution | AI-native video editing operating system built on the same codebase |

Studio is not a second product. It is the operating-system direction of QuickAI Short: capability registry, server-authoritative project documents, MediaGraph-grounded suggestions, orchestrator plan jobs, and chat-primary UX.

---

## What we believe

1. **Conversation is the control plane.** Creators should state intent; the system selects and runs tools.
2. **The AI must actually edit.** Structured actions applied to a real timeline — not marketing copy that claims “AI editing.”
3. **Timeline is visualization.** It shows decisions; it is not required as the primary UI for every task.
4. **Pre-Flight is a skill.** Audience simulation via Google ADK agents is a powerful capability — not the homepage identity.
5. **Gemini-first.** Core AI logic uses Gemini. Google ADK deepens orchestration over time; unfinished ADK UI must stay Coming Soon.
6. **Cost is an acceptance criterion.** Prefer bounded, deduplicated, scale-to-zero-friendly designs without sacrificing reliability.

---

## Today (production)

- YouTube URL or local upload
- Browser Whisper transcription
- Conversational AI editor → edit actions → live preview
- MediaGraph-grounded suggestions
- Server export (Cloud Tasks → private request-bound ffmpeg renderer → GCS; RQ = local fallback only)
- Studio Kernel APIs dual-running under flags
- Pre-Flight multi-agent validation available as a pipeline capability

---

## Tomorrow (Studio OS)

- Deeper media understanding and plan-based tool orchestration
- Native Gemini tool-loop depth (ADR-006 path)
- ADK workspace UI released when ready (today: Coming Soon / blurred)
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
- [`docs/studio/ROADMAP.md`](docs/studio/ROADMAP.md) — execution status  
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system map  
- [`README.md`](README.md) — public product overview  


## Extended global direction (target, not a shipped-status claim)

The long-term direction is a chat-first multimodal creative workspace: users provide supported video, image, audio and document assets; the system builds an evidence-grounded plan; the user applies it conversationally; registered tools execute; and independent quality checks verify delivery. Longer-term capabilities include dubbing, user-controlled editing preferences, product-friction intelligence and accountable subscription operations.

This is a staged target, not a claim of universal file support, nine deployed agents, guaranteed output quality, global regulatory readiness or a finished payout engine. See [42 — Product & Autonomy](docs/studio/42-global-product-and-autonomy-charter.md), [43 — Finance](docs/studio/43-commerce-and-financial-control-plane.md), [44 — Security](docs/studio/44-security-privacy-and-abuse-control-model.md), and [45 — Repository Governance](docs/studio/45-repository-memory-and-agent-governance.md).
