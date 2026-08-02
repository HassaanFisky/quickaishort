# Marketplace + Future Purge — Zero-PES A ROI (2026-08-01)

**Source:** Live `vercel integration discover` on linked project `quickaishort-ls7d` (rootDirectory=`frontend`).  
**Installed Marketplace resources:** **none** (`vercel integration list` → No resources found).  
**Sentry:** already in-repo via `@sentry/nextjs` (not Marketplace-provisioned). Keep wiring; do not double-bill via Marketplace Sentry unless founder consolidates billing.

## A) Marketplace ROI matrix (jeb pe bhari nahi)

| Product (slug) | Necessity for chat-first Studio | Est. $/unit | We already have | Verdict |
|----------------|---------------------------------|-------------|-----------------|---------|
| **Sentry** (`sentry`) | Error visibility at 100k | Free tier → paid | `@sentry/nextjs` + DSN configs | **KEEP existing** — Marketplace add only if unifying Vercel bill (FOUNDER) |
| **PostHog** (`posthog`) | Product analytics / funnels | Free → usage | Partial Sentry analytics helper | **DEFER** — founder OK only after first-2-session funnel defined |
| **Upstash Redis** (`upstash/upstash-kv`) | Edge cache | Usage $ | Redis Cloud / REDIS_URL on API already | **REJECT** duplicate Redis |
| **Neon / Prisma / Supabase / Turso / Convex** | DB | Usage $ | Firestore + Mongo | **REJECT** — stack lock |
| **Clerk / Auth0 / Descope** | Auth | Free→paid | NextAuth JWT | **REJECT** |
| **LaunchDarkly / Statsig / GrowthBook** | Flags | Paid/free OSS | Env flags `core/flags.py` + FE flags | **REJECT** until multi-team |
| **Datadog / Dash0 / Kubiks / Checkly / Rollbar** | Observability | Paid | Sentry + `/metrics` + Cloud Run logs | **REJECT** until measured SLO miss |
| **Stripe** | Payments | Fees | Paddle billing router exists | **KEEP Paddle path** — Stripe only if founder switches PSP |
| **Resend** | Transactional email | Free→usage | Not core MVP | **DEFER** — invite/receipts later |
| **Mux** | Video hosting/CDN | $$ | GCS + signed URLs + Cloudflare later | **REJECT** until 1M media latency Gate 5 |
| **Inngest / QStash** | Workflows | Usage | Cloud Tasks already | **REJECT** duplicate queue |
| **Shopify** | Commerce | N/A | Not our product | **REJECT** |
| **Deep Infra / multi-model AI** | Alt LLMs | $$ | Gemini-only lock | **FORBIDDEN** |
| **CodeRabbit / Sourcery / cubic / Corridor** | AI code review | Subscription | Cursor + human review | **DEFER** — optional DX, not product UX |
| **Vercel Speed Insights / Web Analytics** (platform, not all in discover list) | CWV / funnels | Free tier often | Next core-web-vitals eslint | **FOUNDER-APPROVE free enable** — no new DB/auth |

### Cursor Cloud / Marketplace posture

- Cloud agent tokens (~2000) = engineering compute, not Gemini prepaid. Use for audits/purges when GitHub rate limits allow.
- Cloud subagent this session: **blocked** (`GitHub is rate limiting requests`). Retry later from [cursor.com/dashboard](https://cursor.com/dashboard) if linked.
- Do **not** confuse Cursor cloud tokens with Gemini spend.

## B) Future-fit purge list (still in repo)

| Item | Path evidence | Action | Why |
|------|---------------|--------|-----|
| Orphan FFmpeg.wasm final-export workspace | `frontend/src/_archive/VideoWorkspace.orphan.tsx` | **KEEP in `_archive`** | Already quarantined; do not revive as Final export |
| ADK wizard page | `frontend/src/_archive/adk-studio-wizard-page.tsx` | **KEEP archived** | `/adk` = Coming Soon only |
| FFmpeg.wasm export worker (live tree) | `frontend/src/workers/ffmpegExport.worker.ts` | **DOC-FIX + audit** | Decode/helper ≠ Final; clarify callers; archive if unused by live ExportDialog |
| Dual AI clients | `gemini-editor.ts` / `aiEditorClient.ts` / inline axios | **UNIFY later (P1)** | Fewer token-miss bugs |
| GridFS legacy API | `fastapi` `/api/v1/video/*` | **KEEP legacy, never market** | Do not expand |
| RQ-as-prod myths in old docs | historical COMPLETED logs | **DOC-FIX only** | Cloud Tasks = prod |
| Stale security claims | was `11-security.md` | **FIXED 2026-08-01** | — |
| Fullstack-app-builder Neon/Prisma default | skill default stack | **ANTI-SCOPE** | Never rewrite QuickAI onto that template |
| Notion create-row | skill | **N/A this session** | Notion MCP server not connected |

## C) Trust → subscribe (product ROI)

1. Session 1: load video → chat ack &lt;300ms → one visible edit → pride.  
2. Session 2: Server final export succeeds → watermark OK on Free → Pro CTA **after** win.  
3. Zero spoof Gemini burn (JWT-only + credit fail-closed) = margin.  
4. Honest 429/credits copy = trust; silent hang = churn.

## D) Top 10 next engineering tasks (ROI rank)

1. Founder Gemini top-up + `generateContent` 200  
2. Deploy P0 lockdown (API + Vercel FE)  
3. Founder: GCS IAM no `allUsers`; prod `/docs` 404; `/metrics` admin-gated  
4. Weeks 3–4: shared Pusher singleton; shorten poll when connected  
5. Weeks 5–6: StrictMode ingest crash mitigation  
6. Mobile chat sheet as primary control + a11y  
7. CostGuard hit-rate admin metric  
8. Analyze/re-chat exact-state dedupe coverage  
9. Unify AI clients into authenticated `api.ts`  
10. Optional FOUNDER: enable free Vercel Analytics/Speed Insights only — no Neon/Clerk/Mux

## E) Engineering Decision

| | |
|--|--|
| **Problem** | Want Google-class chat editing UX + global scale without wallet bleed; marketplace temptation vs locked stack. |
| **Options** | (1) Install Neon/Clerk/Mux/Upstash duplicates (2) Keep stack + $0 headers/cost locks + measured Gate 5 spend (3) Rewrite to fullstack-app-builder template |
| **Recommendation** | **Option 2** |
| **Impact** | Protects Gemini prepaid ROI; preserves Cloud Tasks/GCS path; no duplicate Redis/auth/DB bills |
| **Needs founder approval** | Gemini top-up; free Analytics enable; any Marketplace install; GCS lifecycle TTL deletes; repo public→private |
