# 16 — Technical Debt Register

Prioritized. Evidence-based.

| ID | Debt | Impact | Evidence | Priority |
|----|------|--------|----------|----------|
| TD-01 | Dual AI prompt dialects (17 tools vs rich actions) | Wrong/no-op edits | `ai_editor_engine.py` vs `gemini-editor.ts` / `ai_editor.py` | P0 |
| TD-02 | Dual AI panels | UX/code confusion | `components/editor/AIPanel.tsx` + `components/ai/AIPanel.tsx` | P0 |
| TD-03 | Unauthenticated pipeline | Abuse / cost | `pipeline_router.py` | P0 |
| TD-04 | Doc drift (firebase, GridFS primary, Next 14.2.22) | Agent hallucinations | CLAUDE.md, ARCHITECTURE.md, README badges | P0 |
| TD-05 | `gridfs://` URI on GCS writes | Downstream bugs | youtube/tts paths | P1 |
| TD-06 | RQ + Celery dual queues | Ops complexity | `queue_service` + `workers/tasks.py` | P1 |
| TD-07 | `AUTH_DISABLED` lie | Security confusion | `.env.example` | P1 |
| TD-08 | Action enums without FE handlers | Pretend edits | models vs `dispatchAIActions` switch | P1 |
| TD-09 | npm vs pnpm in CI | Reproducibility | `linter.yml` vs docs | P2 |
| TD-10 | README `ci.yml` badge | Broken signal | README vs workflows | P2 |
| TD-11 | Soft credit failure proceeds | Revenue leak | ai_editor_router | P1 |
| TD-12 | Two preflight endpoints | API confusion | `/api/preflight` + `/api/v1/preflight/predict` | P2 |
| TD-13 | Brand strings mixed Shorts/Studio/Editor | Trust | Sidebar vs prompts | P2 |
| TD-14 | Manifest partial coverage | Export fidelity | manifest_renderer | P1 |
| TD-15 | Sparse automated tests | Regression risk | few `fastapi/tests/*` | P1 |

---

## Intentionally keep (not debt)

- Client-side preview NLE (performance + UX)  
- Heuristic instant suggestions (cost control)  
- Pre-Flight ADK loop (moat)  
- Advanced mode URL gate (power users)
