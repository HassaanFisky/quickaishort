# Contributing to QuickAI Short

Thank you for contributing. This repository powers **QuickAI Short** (production) and its evolution into **QuickAI Studio** (AI-native editing OS on the same codebase).

Architecture decisions in [`docs/studio/`](docs/studio/README.md) are binding. EP-001 Capability Registry is **frozen** — do not bypass it.

---

## Rules

1. Prefer focused, atomic pull requests — one logical change per PR.
2. Pass local lint/typecheck/build before opening a PR.
3. Match existing architecture and design tokens (Hydro-Glass — see `CLAUDE.md`).
4. Never commit secrets or `.env` files.
5. Do not reopen frozen ADRs/EPs without a verified defect and explicit approval.
6. Separate **production** claims from **roadmap** (especially ADK UI — Coming Soon).

---

## Local development

```bash
git clone https://github.com/HassaanFisky/quickaishort.git
cd quickaishort

# Frontend
cd frontend && pnpm install && pnpm dev

# Backend (separate terminal)
cd fastapi
python -m venv venv
# Windows: .\venv\Scripts\activate
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Render worker (optional, needs Redis): `python render_worker.py`

Env templates: `frontend/.env.example`, `fastapi/.env.example`.  
Full guide: [`QUICKSTART.md`](QUICKSTART.md).

### Verification

```bash
cd frontend && npx tsc --noEmit && pnpm build && pnpm lint
cd ../fastapi && python -m py_compile main.py
```

---

## Priority areas

- Bug fixes with reproducible steps  
- Conversational editor reliability and Capability Registry correctness  
- Export / RQ / GCS path hardening  
- Accessibility and security  
- Documentation that reduces agent/doc drift  

### Discuss first (RFC)

- New paid services or heavy dependencies  
- Breaking API changes  
- Multiplayer / EP-007 scope  
- Changes to EP-001 registry ABI  
- Legacy GridFS `/api/v1/video/*` cutover  

---

## Standards

- TypeScript strict mode on the frontend  
- Pydantic v2 + type hints on public Python APIs  
- Conventional Commits: `feat:`, `fix:`, `docs:`, `perf:`, `refactor:`, `test:`  
- Cost-efficient designs — see `.cursor/rules/cost-efficient-architecture.mdc`  

---

## Pull requests

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`)  
2. Fill [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)  
3. CI must pass (lint + `tsc` + `next build`)  
4. Link relevant ADR/EP when touching Studio Kernel surfaces  

---

## License

Contributions are licensed under the project [MIT License](LICENSE).
