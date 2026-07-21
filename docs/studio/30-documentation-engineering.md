# 30 — Documentation Engineering

## Purpose of this platform

`docs/studio/` is the **Docs-as-Code product** for **QuickAI Short → QuickAI Studio** architecture. Optimized for agents and humans: evidence-cited, low re-prompt, always separates **production** from **roadmap**.

**Identity lock (2026-07-21):** QuickAI Short = working product; QuickAI Studio = OS evolution on the same codebase. Root `README.md` / `VISION.md` / `ARCHITECTURE.md` must stay aligned with this tree.

---

## Layering

| Layer | Docs |
|-------|------|
| Executive | 00 |
| Product | 01 |
| System | 02–03 |
| Subsystems | 04–14 |
| Delivery | 15–18 |
| Enablement | 19–26 |
| Truth + Plan | 27–28 |
| Policy | 29–30 |
| Decisions | `adrs/` |

---

## ADR rules

- One decision per ADR  
- Status: Proposed / Accepted / Superseded  
- Must cite code paths  
- Link from blueprint tasks  

---

## Sync contract

| Change type | Update |
|-------------|--------|
| New endpoint | 20 + 27 |
| New AI tool | 06 + 28 + matrix |
| Layout IA | 05 + ADR-005 |
| Storage change | 10 + ADR-002 |
| Auth change | 11 + ADR-003 |

---

## Anti-duplication

- Do not copy full CLAUDE working memory here  
- Legacy `docs/*.md` remain operational runbooks; Studio tree owns architecture truth  
- README should link here, not fork vision text  

---

## Review cadence

Before any “Studio launch” marketing: refresh `27-validation-report.md` with greps + live health curl outputs pasted as evidence.
