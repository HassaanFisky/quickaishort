# Studio Roadmap (Execution)

**Last updated:** 2026-07-19 (execution cycle close)

## Complete — current cycle

| Track | Status |
|-------|--------|
| EP-001…007 substrate | ✅ |
| Pipeline JWT + credits fail-closed | ✅ |
| Heuristic suggestion dead code removed | ✅ |
| Chat → Kernel via structured_steps | ✅ |
| CI BE↔FE registry hash | ✅ |
| Auto-ensure Studio project (chat + export) | ✅ |
| Orphan client prompt / useAiCommander removed | ✅ |
| Dashboard AI ≠ editor timeline authority | ✅ |
| Kernel flags in `.env.example` | ✅ |
| FE legacy `{tool,params}` translator removed (TD-EP001-03) | ✅ |
| Production-ready verification gate | ✅ |

**Report:** `packages/EP-COMPLETION-CYCLE-IMPLEMENTATION-REPORT.md`

## Ops handoff (founder / deploy) — not code blockers

- [ ] Set `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1` on Vercel staging then prod  
- [ ] Confirm Cloud Run `STUDIO_PROJECT_KERNEL` not set to `0`  

## Next cycle

| Item | Gate |
|------|------|
| **EP-008** Editor First-Run Product Surface (upload parity, onboarding, Ads CS) | **Spec revised — awaiting FINAL approval** (`APPROVE EP-008 FINAL`) |
| ADR-006 native Gemini tool-loop depth | Optional engineering EP |
| Multiplayer | **Founder approval** (EP-007) |
| Legacy `Projects` cutover delete | **Founder consent** (irreversible) |

> Note: Request labeled “EP-002” for this UX work is a **naming conflict** — EP-002 is frozen Project Kernel. Package id = **EP-008**.

## Deferred UI

Coming Soon placeholders for intentionally deferred features (incl. planned ADK). Non-interactive; must not imply live functionality.
