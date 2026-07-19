# Studio Roadmap (Execution)

**Last updated:** 2026-07-19

## Complete — Part G + soak

| Track | Status |
|-------|--------|
| EP-001…007 substrate | ✅ |
| Pipeline JWT auth (TD-LEGACY-01) | ✅ Fixed |
| Heuristic suggestion dead code removed | ✅ |
| Chat → Kernel via structured_steps (no double LLM) | ✅ |
| CI BE↔FE registry hash | ✅ |
| Auto-ensure Studio project when Kernel flag on | ✅ |

## Ops (founder / deploy)

- Set `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1` on Vercel staging then prod  
- Confirm Cloud Run `STUDIO_PROJECT_KERNEL` not set to `0`  

## Optional next

- ADR-006 native Gemini tool-loop depth  
- Delete orphan `EDITOR_SYSTEM_PROMPT` after Next route audit  
- Multiplayer — **requires founder approval** (EP-007)

## Deferred UI

Coming Soon placeholders for intentionally deferred features (incl. planned ADK). Non-interactive; must not imply live functionality.
