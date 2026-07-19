# 02 — Repository Walkthrough

**Root:** `e:\QuickAI Short orignal` (also referenced as QuickAI Short original)

---

## Top-level map

| Path | Role |
|------|------|
| `frontend/` | Next.js 14.2.35 UI, editor, auth, dashboard, ADK wizard |
| `fastapi/` | FastAPI API, ADK agents, RQ worker, services |
| `docs/` | Operational docs (deployment, video API, sentry) |
| `docs/studio/` | **This** architecture + Studio blueprint platform |
| `extension/` | Chrome extension → opens `/editor?v=` |
| `tests/` | Legacy video API tests |
| `.github/workflows/` | `linter.yml`, `deploy-video-pipeline.yml` |
| `ARCHITECTURE.md` | Challenge-era Pre-Flight diagram (partially stale) |
| `VISION.md` | Shorts roadmap (superseded for Studio by `01-product-vision.md`) |
| `CLAUDE.md` | Agent protocol + working memory (contains outdated claims — see validation report) |
| `PRODUCTION_STATUS.md` | Snapshot 2026-05-24 |
| `deploy_production.ps1` / `.sh` | Production deploy scripts |
| `cloudbuild.yaml` | Cloud Build |

---

## Frontend entry points

| Entry | Path |
|-------|------|
| Marketing | `frontend/src/app/page.tsx` |
| Editor | `frontend/src/app/editor/page.tsx` → `EditorLayout.tsx` |
| Dashboard | `frontend/src/app/(dashboard)/dashboard/page.tsx` |
| ADK Studio wizard | `frontend/src/app/(dashboard)/adk/page.tsx` |
| Auth | `frontend/src/app/(auth)/signin|signup|...` |
| State | `frontend/src/stores/editorStore.ts`, `aiPanelStore.ts`, `uiStore.ts` |
| AI client | `frontend/src/lib/gemini-editor.ts`, `lib/aiEditorClient.ts`, `hooks/useAiCommander.ts` |
| Tool catalog | `frontend/src/lib/aiToolCatalog.ts` |
| Workers | `frontend/src/workers/` (Whisper, FFmpeg export — verify filenames in tree) |
| API wrapper | `frontend/src/lib/api.ts` |

### App routes (verified `page.tsx` files)

`/`, `/editor`, `/dashboard`, `/adk`, `/history`, `/settings`, `/pricing`, `/about`, `/privacy`, `/terms`, `/refund-policy`, auth pages.

---

## Backend entry points

| Entry | Path |
|-------|------|
| API process | `fastapi/main.py` |
| RQ worker | `fastapi/render_worker.py` |
| Celery legacy | `fastapi/workers/tasks.py` |
| Agents | `fastapi/agent/*.py` |
| AI editor engine | `fastapi/services/ai_editor_engine.py` |
| Gemini client | `fastapi/services/gemini_client.py` |
| Auth | `fastapi/services/auth.py` |
| Scaffolds | `fastapi/agent/scaffolds/*.md` |

### Routers included from `main.py` (verified via audit)

`billing`, `youtube`, `preflight` (v1), `video` (v1 GridFS), `admin_cookies`, `pipeline_router`, `ai_editor_router`, `agent_runtime_router`, `broll_router`, `analytics`, `email_router` + many `@app` routes in `main.py`.

---

## Hidden / easy-to-miss

| Path | Note |
|------|------|
| `fastapi/agent/scaffolds/` | Agent identity/memory docs for runtime |
| `frontend/public/wasm`, `audio-worklets`, `sfx` | Browser media assets |
| `fastapi/env.yaml`, `env-worker.yaml`, `.env.yaml` | Deploy env templates — **do not commit secrets** |
| `.env*` files present locally | Gitignored patterns; never document values |

---

## Naming reality

| Brand in UI | Evidence |
|-------------|----------|
| “QuickAI Shorts” | `Sidebar.tsx` logo text |
| “QuickAI Editor” / “Quick AI Studio” | prompts in `gemini-editor.ts`, `ai_editor_engine.py` |
| Package name `quickai-shorts` | `frontend/package.json` |

**Migration note:** Brand rename is a coordinated FE copy + docs + extension string change — not a rewrite.
