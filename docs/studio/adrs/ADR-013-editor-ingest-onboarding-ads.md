# ADR-013 — Editor Ingest Parity, Interactive Onboarding, Ads Coming Soon

**Status:** Accepted  
**Date:** 2026-07-20  
**Package:** EP-008 (implemented)  

## Context

First-session UX privileges YouTube over upload; onboarding missing; Ads Coming Soon not in nav. Capability Registry (EP-001) is frozen for *edit tools*. Format policy must be backend-authoritative without corrupting that ABI.

## Decision

1. **Ingest parity:** Upload Video and Paste YouTube URL are equal first-class paths (drag/drop, click, mobile/desktop pickers, keyboard/SR; clipboard paste when browser permits; replace media).  
2. **Media Ingest Policy API:** Authoritative extension/MIME/size rules via `GET /api/studio/v1/ingest/policy` + validation on presigned upload — **not** EP-001 capability rows. UI shows examples only.  
3. **Honest upload states:** validating, uploading (progress), processing, error, retry, cancel, replace.  
4. **Onboarding:** Interactive spotlight tour once after first signup path; never interrupt returning users; lazy-loaded; skippable; persisted; teaches interaction.  
5. **Suggestions:** MediaGraph only (ADR-009) — no heuristics/fake chips.  
6. **Ads:** Visible nav → blurred premium Coming Soon; lazy route; no unfinished functionality.  
7. **Performance:** Lazy-load tour and Ads; do not regress editor startup.  
8. **Design:** Discoverability + lower cognitive load; no visual redesign.  
9. **Package ID:** EP-008 (EP-002 remains Project Kernel).

## Consequences

- Ops can evolve allowlists without FE hardcode drift.  
- Clear separation: ingest policy ≠ edit capability registry.  
- Slightly more FE surface area; offset by lazy-loading.

## Alternatives rejected

- Hardcoded FE-only format lists — drifts from server.  
- Putting codecs into EP-001 capabilities JSON — wrong ABI, breaks freeze intent.  
- Upload-only-on-error — fails discoverability.  
- Forcing tour on all existing users — interrupts returning users.
