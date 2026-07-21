# Studio Roadmap (Execution)

**Last updated:** 2026-07-21 (ops: cost-policy Cloud Run reconciliation)

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

- [x] Set `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1` on Vercel production (2026-07-20)  
- [x] Confirm Cloud Run `STUDIO_PROJECT_KERNEL=1` on `quickai-api` (+ worker)  
- [x] Redis migrated to Upstash (`rediss://` TLS); Cloud Run + Vercel + local envs updated; `/health` → `redis:true`  
- [x] `quickai-worker` `--min-instances=1` + `--no-cpu-throttling` so RQ stays registered on Upstash (verified `Worker.all() >= 1`)  
- [x] Worker public health soak: `ingress=all` + unauthenticated invoker; hardened `BaseHTTPRequestHandler` — `/health` + `/health/ready` → 200 (`redis:true`)  
- [x] **Cost policy (2026-07-21):** binding rule in `.cursor/rules/cost-efficient-architecture.mdc` + `CLAUDE.md`  
- [x] **API cost cut:** `quickai-api` → `min-instances=0` + cpu-throttling (request-billed)  
- [x] **Worker cost cut (keep reliability):** keep `min=1` / no throttling (RQ listener), reduce **cpu 2→1**, memory 4Gi; verified `Worker.all()=1` + `/health/ready` 200  

### Gemini (honest blocker)

- New AI Studio key: AUTH OK, **429 prepayment credits depleted** — founder must top up credits at https://ai.studio/projects before any Cloud Run/Vercel key rotate.

### Code hardening (2026-07-21) — not waiting on founder

- AI Editor credits fail-closed + stream gated (`CREDITS_SOFT_FAIL` opt-in only)
- Onboarding tour opens AI panel for `ai.*` steps
- No canned fake Gemini analysis on failure
- MediaGraph FinOps: ensure-by-project + 400ms facet debounce + suggestions single-read
- Retired invent route `POST /api/ai/suggestions` → 410
- Honest AIPanel 402/503/429 quota messaging

## Next cycle

| Item | Gate |
|------|------|
| **Ship FE + BE FinOps bind** (`a8da56c`) | ✅ Done — Vercel READY + `quickai-api-00097-n9g` |
| **EP-008** Editor First-Run Product Surface (upload parity, onboarding, ADK CS) | ✅ Implemented — ADK≠Ads correction + full-workspace CS polish |
| ADR-006 native Gemini tool-loop depth | Optional engineering EP |
| Multiplayer | **Founder approval** (EP-007) |
| Legacy `Projects` cutover delete | **Founder consent** (irreversible) |
| Gemini `generateContent` live | **Founder top-up** — 429 prepayment credits |
| Demo / Devpost / Google form | **Founder** (challenge checklist) |

> Note: Request labeled “EP-002” for this UX work is a **naming conflict** — EP-002 is frozen Project Kernel. Package id = **EP-008**.

## Deferred UI

Coming Soon placeholders for intentionally deferred features (incl. planned ADK). Non-interactive; must not imply live functionality.
