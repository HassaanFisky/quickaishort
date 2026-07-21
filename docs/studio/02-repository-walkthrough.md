# 02 — Repository Walkthrough

**Root:** `e:\QuickAI Short orignal` (also referenced as QuickAI Short original)

---

## Top-level map

| Path | Role |
|------|------|
| `frontend/` | Next.js 14.2.35 UI, editor, auth, dashboard; `/adk` Coming Soon |
| `fastapi/` | FastAPI API, ADK agents, Studio Kernel, RQ worker, services |
| `docs/` | Operational docs (deployment, video API, sentry) |
| `docs/studio/` | **Canonical** architecture + Studio OS docs |
| `extension/` | Chrome extension → opens `/editor?v=` |
| `tests/` | Legacy video API tests |
| `.github/workflows/` | `linter.yml`, `deploy-video-pipeline.yml` |
| `ARCHITECTURE.md` | System overview (synced 2026-07-21) |
| `VISION.md` | QuickAI Short → Studio evolution (synced 2026-07-21) |
| `CLAUDE.md` | Agent protocol + live working memory |
| `PRODUCTION_STATUS.md` | Historical deploy snapshot 2026-05-24 |
| `deploy_production.ps1` / `.sh` | Production deploy scripts |
| `cloudbuild.yaml` | Cloud Build |

---

## Frontend entry points

| Entry | Path |
|-------|------|
| Marketing | `frontend/src/app/page.tsx` |
| Editor | `frontend/src/app/editor/page.tsx` → `EditorLayout.tsx` |
| Dashboard | `frontend/src/app/(dashboard)/dashboard/page.tsx` |
| ADK Coming Soon workspace | `frontend/src/app/(dashboard)/adk/page.tsx` (blurred; wizard archived) |
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
| “QuickAI Short” / Studio copy | Sidebar, marketing, editor chrome — verify in UI before claiming |
| “QuickAI Editor” / Studio Kernel prompts | `gemini-editor.ts`, `ai_editor_engine.py` |
| Package name `quickai-shorts` | `frontend/package.json` (legacy npm name; product = QuickAI Short) |

**Product naming:** QuickAI Short = production; QuickAI Studio = evolution. Docs synced 2026-07-21; UI string audit may still find legacy “Shorts” plurals.
