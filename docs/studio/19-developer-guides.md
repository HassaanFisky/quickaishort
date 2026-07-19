# 19 — Developer Guides

## First hour (contributor)

1. Read `docs/studio/00-executive-overview.md` + `01-product-vision.md`  
2. Skim `02-repository-walkthrough.md`  
3. Run FE typecheck: `cd frontend && npx tsc --noEmit`  
4. Run BE syntax: `cd fastapi && python -m py_compile main.py`  
5. Read `frontend/docs/HOW_TO_TEST_AI_COMMANDER.md` before touching AI editor  

**Do not** invent env values; copy from `fastapi/.env.example` and `frontend/.env.example` (never commit filled secrets).

---

## Where to change what

| Goal | Start here |
|------|------------|
| New AI edit action | `models/ai_editor.py` → sanitiser → `editorStore` switch → catalog → prompts |
| New export look | `render_manifest` + `manifest_renderer` + FE compile helpers |
| New agent | `fastapi/agent/` + scaffolds + `agent_runtime` registration |
| New dashboard page | `frontend/src/app/(dashboard)/` + Sidebar `NAV_ITEMS` |
| Auth change | `services/auth.py` + NextAuth options — keep secret parity |

---

## Anti-hallucination rules for agents

1. Grep before claiming endpoint exists  
2. Prefer `docs/studio/27-validation-report.md` over CLAUDE memory  
3. Mark unverified live prod claims Insufficient evidence  

---

## Tests

```bash
cd fastapi
# use project venv pip only
venv\Scripts\python -m pytest tests/ -q
```

FE: no full Jest suite found; use commander script `frontend/scripts/test-ai-editor-client.mjs` and manual HOW_TO doc.
