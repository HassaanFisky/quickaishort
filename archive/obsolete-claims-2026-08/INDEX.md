# Obsolete / Quarantine Index — 2026-08-01

**Purpose:** Single place for claims, paths, and artifacts that are **no longer product truth**.
Do **not** import code from here into the live app. Live fixes stay in `frontend/`, `fastapi/`, `docs/studio/`.

## Why this folder exists

Agents and humans were re-reading stale claims (unauth pipeline, GridFS-primary, RQ-as-prod-render,
FFmpeg.wasm as Final export). That burns Gemini prepaid, mis-audits security, and confuses UX copy.

## Verified obsolete claims (fixed in live docs 2026-08-01)

| Claim | Was in | Truth now |
|-------|--------|-----------|
| `POST /api/pipeline/run` unauthenticated | `docs/studio/11-security.md`, `20-api-reference.md` | JWT + credits fail-closed |
| Body `userId` can bill/spend | Soft spots in `main.py` | JWT sole tenant on analyze/export/preflight/direct/create-video |
| Prod OpenAPI open | Default FastAPI | Disabled when `ENVIRONMENT=production` |
| FE missing CSP/HSTS | `next.config.mjs` | Report-only CSP + HSTS + Permissions-Policy shipped |
| FFmpeg.wasm = live Final export | CLAUDE historical, `05-frontend.md`, architecture diagram | Preview = WebCodecs/MediaRecorder; Final = Cloud Tasks → private ffmpeg |
| RQ always-on worker = production | Old architecture diagrams | Cloud Tasks + `min=0` private renderer; RQ = local fallback only |
| GridFS primary media | Superseded 2026-05-29 notes | GCS primary; GridFS = legacy `/api/v1/video/*` only |
| Next.js 14.2.22 | Old COMPLETED logs | **14.2.35** |
| Live ADK Studio wizard | Marketing drift | `/adk` = Coming Soon blur only |
| Shopify POS UI skill | Cursor skill invoke | **Irrelevant** to QuickAI video SaaS — retail POS only |

## Live archive already in repo (do not duplicate)

| Path | Role |
|------|------|
| `frontend/src/_archive/VideoWorkspace.orphan.tsx` | Orphan workspace (FFmpeg.wasm final path) |
| `frontend/src/_archive/adk-studio-wizard-page.tsx` | Archived ADK wizard UI |

## Free / zero-PES A marketplace posture (do NOT install without founder OK)

| Option | Cost | Verdict for QuickAI |
|--------|------|---------------------|
| Next.js security headers (done) | $0 | **USE** — CSP report-only → enforce |
| Keep NextAuth (already) | $0 marginal | **KEEP** — do not add Clerk Marketplace |
| Keep Firestore + Mongo (already) | existing | **KEEP** — do not add Neon/Postgres Marketplace |
| Keep existing Sentry wiring | existing plan | **KEEP** — no second APM until measured |
| Vercel Analytics / Speed Insights free tier | $0–usage | Optional later for Core Web Vitals — **founder approve** |
| Paid WAF / Armor / CDN | $ | **DEFER** until abuse or 1M media latency measured |
| OpenAI/Anthropic Marketplace models | $ + contest lock | **FORBIDDEN** — Gemini-only |

## Founder-only (cannot be engineered away)

1. Gemini prepaid top-up → `generateContent` 200  
2. Confirm GCS bucket has no `allUsers` objectViewer  
3. Confirm prod `ENVIRONMENT=production` + secrets set  
4. Public MIT repo keep vs private (source-hide is GitHub setting, not runtime)

## Next engineering layers (post-lockdown)

See expanded readiness notes in the global chat scale working doc (Weeks 3–52). Priority order:

1. Chat latency honesty (stream stages, shared Pusher, cold-start measure)  
2. Ingest StrictMode crash mitigation  
3. Mobile chat-sheet + a11y  
4. CostGuard hit-rate admin + analyze dedupe  
5. Log redaction + deletion cascade design  
6. ADR-006 FunctionDeclaration behind flag  
7. CDN/WAF only when Gate 5 triggers fire  

## Update 2026-08-01 evening

- Added `MARKETPLACE_AND_PURGE_ROI.md` — live Vercel discover + reject matrix + purge list + top-10 ROI tasks.
- Marketplace install count: **0** resources on `quickaishort-ls7d`.
- Cloud agent spawn failed (GitHub rate limit) — retry later; work done locally.
