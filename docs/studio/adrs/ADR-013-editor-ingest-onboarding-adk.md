# ADR-013 — Editor Ingest Parity, Interactive Onboarding, ADK Coming Soon

**Status:** Accepted · **ADK≠Ads correction implemented** (`APPROVE ADK CORRECTION`)  
**Date:** 2026-07-20 (corrected same day)  
**Package:** EP-008  
**Supersedes naming:** Prior draft titled “Ads Coming Soon” — **invalid**. See `EP-008-ADK-ARCHITECTURE-CORRECTION.md`.

## Context

First-session UX privileges YouTube over upload; onboarding missing; future **Google Agent Development Kit (ADK)** workspace must be discoverable but intentionally unavailable. Capability Registry (EP-001) is frozen for *edit tools*. Format policy must be backend-authoritative without corrupting that ABI.

**Misunderstanding corrected:** EP-008 briefly treated the Coming Soon nav as **Ads** (advertisements). That is wrong. **ADK = Agent Development Kit**, not Ads.

## Decision

1. **Ingest parity:** Upload Video and Paste YouTube URL are equal first-class paths (drag/drop, click, mobile/desktop pickers, keyboard/SR; clipboard paste when browser permits; replace media).  
2. **Media Ingest Policy API:** Authoritative extension/MIME/size rules via `GET /api/studio/v1/ingest/policy` + validation on presigned upload — **not** EP-001 capability rows. UI shows examples only.  
3. **Honest upload states:** validating, uploading (progress), processing, error, retry, cancel, replace.  
4. **Onboarding:** Interactive spotlight tour once after first signup path; never interrupt returning users; lazy-loaded; skippable; persisted; teaches interaction.  
5. **Suggestions:** MediaGraph only (ADR-009) — no heuristics/fake chips.  
6. **ADK (Google Agent Development Kit):** Visible sidebar item → ADK workspace route → premium blurred **Coming Soon** + short professional subtitle; reserved disabled/blurred IA skeleton (Agents, Workflows, Tools, Memory, Knowledge, MCP, Integrations, Automation); lazy route; **not** an ads/marketing page; no unfinished live orchestration UI.  
7. **Performance:** Lazy-load tour and ADK Coming Soon workspace; do not regress editor startup.  
8. **Design:** Discoverability + lower cognitive load; no visual redesign of the app shell.  
9. **Package ID:** EP-008 (EP-002 remains Project Kernel).  
10. **Frozen systems:** Do not modify EP-001, ADR-007, ADR-008, Project Kernel, Capability Registry, Orchestrator, Media Graph, or Project Document for this correction.

## Consequences

- Ops can evolve allowlists without FE hardcode drift.  
- Clear separation: ingest policy ≠ edit capability registry.  
- ADK IA is reserved early → less redesign when agent orchestration ships.  
- Invalid `/ads` Ads product surface must be removed at implementation (after founder approval).

## Alternatives rejected

- Hardcoded FE-only format lists — drifts from server.  
- Putting codecs into EP-001 capabilities JSON — wrong ABI, breaks freeze intent.  
- Upload-only-on-error — fails discoverability.  
- Forcing tour on all existing users — interrupts returning users.  
- **Ads Coming Soon page** — wrong product concept (ADK ≠ Ads).  
- Blank blur-only ADK page with no reserved IA — weaker long-term maintainability.
