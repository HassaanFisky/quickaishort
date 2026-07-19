# 26 — Maintenance Guide

## Keep code ↔ docs sync

1. Any new endpoint → update `20-api-reference.md` same PR  
2. Any new AI action → update coverage matrix in blueprint + models  
3. Any ADR decision → add under `adrs/`  
4. Quarterly: re-run validation report section against greps  

## Dependency hygiene

- Backend: venv pip only; freeze to `requirements.txt` after installs  
- Frontend: prefer pnpm; align CI eventually  
- Prefer MIT/Apache/BSD (see `29-cost-and-oss-policy.md`)  

## Brand maintenance

When renaming to Studio: update Sidebar, extension README strings, package name (careful with stores), prompts claiming product name.

## Do not

- Commit `.env` values  
- Delete GCS/Mongo data without consent  
- Expand CLAUDE working memory with unverified “live” claims
