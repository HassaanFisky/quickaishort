# ADR-013 — Editor Ingest Parity, Interactive Onboarding, Ads Coming Soon

**Status:** Proposed (blocked on EP-008 approval)  
**Date:** 2026-07-20  
**Package:** EP-008  

## Context

EP-001…007 substrate is live. First-session UX still privileges YouTube URL over local upload; interactive onboarding is absent; Ads Coming Soon is not in nav. Suggestions must remain MediaGraph-grounded (ADR-009).

## Decision

1. **Ingest parity:** Upload Video and Paste YouTube URL are equal, always-visible first-class entry points on `/editor`.  
2. **Upload honesty:** Validate allowlisted containers; show progress/error/retry; v1 = local preview + GCS presigned PUT (chunked resumable = follow-up).  
3. **Onboarding:** Interactive spotlight tour once after first signup path; skippable; resumable; teach by action; Settings replay only.  
4. **Suggestions:** No heuristics — MediaGraph only (reaffirm ADR-009 / Phase 2 A5a).  
5. **Ads:** Visible nav item → blurred premium Coming Soon; no unfinished functionality.  
6. **EP-001:** Frozen — no registry ABI changes in EP-008 v1.  
7. **Package ID:** This work is **EP-008**, not EP-002 (EP-002 remains Project Kernel / ADR-008).

## Consequences

- Higher first-session success; clearer mental model.  
- Slight UI density on import card (acceptable).  
- New onboarding persistence API.  
- Ads route is non-interactive by design.

## Alternatives rejected

- Upload-only-on-error (current) — fails discoverability.  
- Heuristic suggestion chips during empty graph — violates A5a.  
- Hiding Ads until built — violates product rule to show Coming Soon.
