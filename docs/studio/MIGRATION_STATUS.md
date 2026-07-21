# Migration Status

**Last updated:** 2026-07-21 (cost-policy Cloud Run reconciliation)

## Project storage

| Layer | Collection / API | Role | Status |
|-------|------------------|------|--------|
| Legacy ADK helpers | Firestore `Projects` / `/api/projects` | Historical ADK project records | Live — do not break; UI wizard = Coming Soon |
| Studio Kernel | Firestore `studio_projects` / `/api/studio/v1` | Authoritative edit log | **Live (code)** — dual-run |
| Dual-run | Both | BE `STUDIO_PROJECT_KERNEL` + FE `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL` | Required until cutover |

## EP-001

Registry live; FE sync copy at `frontend/src/lib/generated/capabilities.v1.json`. Frozen.  
CI enforces BE↔FE SHA-256 match via `fastapi/scripts/check_registry_sync.py`.  
Verified untouched at cycle close.

## Cutover readiness (code)

- Pipeline JWT + fail-closed credits ✅  
- Editor chat → Kernel (`structured_steps`) when FE flag on ✅  
- Export `ensureStudioProject` + `project_id` / revision bind ✅  
- Flags documented in `.env.example` ✅  
- FE accepts canonical actions only (legacy translator removed) ✅  
- EP-008 ingest policy + onboarding prefs (`studio_user_prefs`) ✅  

## EP-008 migration notes

- No destructive migration.  
- Firestore collection `studio_user_prefs` created on first onboarding write.  
- Users with prior exports skip tour automatically.  

## Prod cutover still requires

1. ~~Vercel: `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1`~~ ✅ (2026-07-20)  
2. ~~Cloud Run: Kernel not forced off~~ ✅ `STUDIO_PROJECT_KERNEL=1`  
3. ~~Worker always-on for RQ~~ ✅ **Justified under cost policy (2026-07-21):** RQ BLPOP needs a live listener — `min-instances=1` + `--no-cpu-throttling` kept. Idle waste cut via **cpu 2→1** (memory 4Gi). Blind `min=0` without wake path would drop `Worker.all()` and break renders.  
4. ~~API scale-to-zero~~ ✅ `quickai-api` **min-instances=0** + **cpu-throttling=true** (request-billed; cold-start probes already tolerate heavy imports)  
5. Soak under real traffic (Redis = Upstash; RedisLabs host retired) — health OK 2026-07-21  
6. **Founder approval** before deleting legacy `Projects`  
7. **Gemini blocker:** new AI Studio key authenticates but returns **429 prepayment credits depleted** on project `99900313102` — do not deploy until `generateContent` returns 200  

## Code hardening (2026-07-21 ownership cycle)

- AI Editor credit gate fail-closed (pipeline parity) on `/api/ai-edit`, `/api/ai-editor/command`, `/api/ai-editor/command/stream`. Opt-in `CREDITS_SOFT_FAIL=true` for non-prod only.  
- Onboarding tour opens AI panel before `ai.*` spotlight steps.  
- `analyzeVideoWithGemini` no longer returns canned fake topics/edits on failure — errors propagate as HTTP 500.  
- **Deployed:** `quickai-api` revision **00097-n9g** (image `a8da56c` — bind + facet no-op); prior credit fail-closed on **00094-nqg**.  
- Deploy scripts locked to cost-policy settings (no more min=1 / wrong bucket footgun).  
- Frontend FE tour + honest Gemini + FinOps + invent landmine fixes — **pushed to `origin/main`** (`a8da56c`); Vercel production READY.  
- CI unblock: move pnpm overrides → `pnpm-workspace.yaml` (pnpm 10+), pin CI `pnpm@10.28.2`, black-format Studio Python files.

## FinOps MediaGraph cycle (2026-07-21 ownership — complete)

- AIPanel uses `POST .../media-graphs/by-project/{id}/ensure` when Studio project exists (idempotent; stops orphan graph creates).  
- Kernel-on path never creates `project_id: null` orphan graphs.  
- Facet refresh debounced 400ms (cuts Firestore write churn on transcript/silence/clips).  
- Suggestions router: single ownership+derive read (no duplicate Firestore get).  
- Orphan `POST /api/ai/suggestions` retired → **410** (ADR-009 landmine closed).  
- `15-production-readiness.md` Go/No-Go synced: editor suggestion rail = Go; deep vision = Conditional; Gemini credits = No-Go until top-up.  
- AIPanel error copy: honest 402/503/429 quota (not fake “rate limit only”).

## Hardening cycle 2 (2026-07-21) — durable bind + write amplification — complete

- `StudioProjectHead.media_graph_id` bound on ensure (metadata patch; no ProjectEvent / no revision bump).  
- Ensure prefers O(1) head pointer before `find_by_project` query.  
- `upsert_facets` no-op when payload+status+provenance unchanged (no Firestore rewrite / no revision bump).  
- AIPanel skips suggestions GET when upsert revision unchanged.  
- `/api/analyze-video` Path B never invents `suggestedEdits` (topics only; empty edits array).  
- **BE live:** `quickai-api` revision **00097-n9g** (image tag `a8da56c`) — Cloud Build auto-deploy after push.  
- **FE live:** Vercel production READY on `a8da56c` (`dpl_m7aozkFzvmU7opf8s1Z6zRDJzPvB`).

## Hardening cycle 3 (2026-07-21) — leftover polish

- Ingest CTA copy parity: Generate button neutral; AIPanel strip = upload **or** URL.  
- ADK Coming Soon: full-workspace blur (IA under gate); Hydro-Glass skeleton (no purple/pink cards).  
- ComingSoonGate lock: muted, no accent glow.

## Irreversible ops

No production Firestore/GCS deletes without explicit founder consent.
