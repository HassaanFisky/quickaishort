# EP-008 / ADR-013 — Architecture Correction (ADK ≠ Ads)

**Status:** **APPROVED + IMPLEMENTED** (`APPROVE ADK CORRECTION`)  
**Date:** 2026-07-20  
**Scope:** Spec + code. Invalid Ads surface removed; ADK Coming Soon workspace shipped.

---

## Binding terminology

| Term | Meaning | Invalid meaning |
|------|---------|-----------------|
| **ADK** | Google **Agent Development Kit** — future agent orchestration workspace | Advertisements / marketing / “Ads” page |
| **Ads** | **Invalid** for EP-008 / ADR-013 / Studio sidebar product concept | — |

Every product, nav, route, and doc reference that treated EP-008’s Coming Soon surface as **Ads** is **wrong** and must be removed from the package.

---

## Product decision (binding)

The left sidebar contains an item named **ADK**.

- It represents the **future Google Agent Development Kit workspace**.
- It is **intentionally unavailable** in the current release.
- **Not** an advertisement page. **Not** a marketing page.

### Current intended UX (spec — not code yet)

1. Sidebar item **ADK** remains visible.  
2. Click opens the **ADK workspace route**.  
3. Entire ADK workspace is visually blurred using existing Hydro-Glass / `ComingSoonGate` language.  
4. Center message: **Coming Soon**.  
5. One short professional subtitle: advanced agent orchestration capabilities arrive in a future release.  
6. No playful illustrations, low-quality placeholders, or temporary-looking UI.  
7. Premium, polished, responsive, production-quality; no layout shift / overflow / broken spacing; theme consistency mandatory.  
8. Sidebar navigation **architecture** unchanged (same Sidebar + BottomTabBar pattern).  

### Reserved information architecture (recommended — binding for ADK workspace design)

Do **not** ship a blank blur screen only. Reserve a visible **disabled/blurred skeleton** so future direction is clear:

| Reserved surface | State |
|------------------|--------|
| ADK (workspace root) | Coming Soon / blurred |
| Agents | Disabled / blurred |
| Workflows | Disabled / blurred |
| Tools | Disabled / blurred |
| Memory | Disabled / blurred |
| Knowledge | Disabled / blurred |
| MCP | Disabled / blurred |
| Integrations | Disabled / blurred |
| Automation | Disabled / blurred |

Structure visible; interaction blocked. Establishes IA before features ship.

---

## What was wrong

EP-008 D6 + ADR-013 item 6 + implementation (`/ads`, nav label **Ads**, Megaphone) incorrectly interpreted the Coming Soon requirement as an **Ads** product page.

That assumption is **invalid** and must be excised from EP-008 / ADR-013 and related Studio docs.

---

## Frozen architecture (must not change)

No edits to:

- EP-001 Capability Registry ABI  
- ADR-007 / ADR-008  
- Project Kernel  
- Capability Registry  
- Orchestrator  
- Media Graph  
- Project Document  
- Any other frozen architecture package  

Ingest parity, Media Ingest Policy API, onboarding tour, and MediaGraph-only suggestions from EP-008 remain valid and are **unrelated** to this ADK vs Ads correction.

---

## Implementation (completed)

1. Removed Ads nav + `/ads` page; `/ads` permanent-redirects to `/adk`.  
2. `/adk` = ADK Coming Soon workspace + reserved IA skeleton (`AdkComingSoonWorkspace`).  
3. Live **ADK Studio** wizard archived off-route at `frontend/src/_archive/adk-studio-wizard-page.tsx` (excluded from `tsc`). Nav label **ADK**. Frozen Kernel / Registry / MediaGraph untouched.
