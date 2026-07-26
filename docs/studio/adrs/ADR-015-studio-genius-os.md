# ADR-015 — Studio Genius OS (Chat-Native Evolution)

- **Status:** Accepted  
- **Date:** 2026-07-26  
- **Supersedes / relates:** ADR-006 (native FC = Phase 2), ADR-011 (chat-primary shell), ADR-014 (Dub Video)

## Context

Founder north star: ChatGPT-feel editing that approaches Premiere-depth capability over time, with **prodigy output**, **pocket-friendly cost**, and **QuickAI brand only** in the UI (no vendor model names). Audits showed: InMemory orchestrator plans (multi-instance hole), multi-turn history unused, streaming unused, floating Dub sheet feel, dead tools mode, and stub `ADD_SFX`.

## Decision

1. **Evolve existing full-stack** (Next.js + FastAPI + GCS + Cloud Tasks + Gemini). Reject greenfield rewrite.
2. **Intelligence path:** Internal routing profiles `luna-orchestration-v1` (primary chat→edit) + `terra-json-repair-v1` (one repair) + `gemini-visual-v1` on **Gemini Flash family**. UI never labels vendor models — only “QuickAI”.
3. **Function calling:** Keep ADR-006 as **Phase 2** after chat honesty ships. Phase 1 does not claim native FC.
4. **Phase 1 ship (this ADR):**
   - Redis durable Orchestrator `PlanStore` (TTL, scale-to-zero friendly)
   - Universal suggestion copy + docked Dub inside Studio chat
   - Multi-turn `history` on `/api/ai-editor/command` (+ stream path)
   - Post-reply follow-up chips from model `suggestions`
   - Real client `ADD_SFX` preview (Web Audio synthesize fallback; catalog emit=true)
   - Kill dead tools-mode shortcut; rename floating chat → Studio chat
5. **Graded quality (later spend gate):** Free stays Flash; Pro may use heavier Gemini SKU behind the same Luna/Terra profiles — UX never degrades into a “broken Free”.
6. **Movie-length (1–2 hr) dub:** Explicitly **deferred** future EP — not ADR-014 shorts path.

## Consequences

- Multi-instance plan→execute reliable without Firestore cost for plans
- Chat feels conversational; Kernel ack copy stays honest (Preview vs Saved)
- SFX preview is real; bake into export remains a later EP
- Marketing must not claim “Premiere complete” until capability ladder wires tools one-by-one

## Non-goals

- OpenAI / external “Luna GPT”
- Showing Gemini/Luna/Google/Adobe names in product chrome
- Emitting stub capabilities as interactive chat tools
