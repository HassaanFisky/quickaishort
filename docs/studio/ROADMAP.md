# Studio Roadmap (Execution)

**Last updated:** 2026-11-08 (Edit-contract E-1/E-2/E-3 closure + ModePack aspect-aware sanitiser + CPU fast engine suite)

## Complete — current cycle

| Track | Status |
|-------|--------|
| EP-001…008 substrate | ✅ |
| Pipeline JWT + credits fail-closed | ✅ |
| M3 ingest FSM (`useIngestLifecycle`) | ✅ Live — FE Vercel + API `00109+` |
| Chat → Kernel via structured_steps | ✅ |
| **Decision-Gated Edit M0→G (ADR-016)** | ✅ Main — contracts + gated Orchestrator + Tier 0 Kernel-event verify |
| **Edit-Contract Audit E-1/E-2/E-3** | ✅ First-class `risk` & `reversibility` on `DecisionRecord`, `command_ids` cross-linking, `decision_store` failure metrics |
| **Typed-chat director loop** | ✅ Dead-air / shorts-packaging / restore-opening intercept **before** DualModelRouter + credits; Redis latest DecisionRecord; unresolved clauses stay ASK |
| **ModePack aspect-aware sanitiser** | ✅ Dynamic canvas bounds (`9:16`, `16:9`, `1:1`, `4:5`) + deterministic CPU Fast Engine test suite |
| **ModePack Selector & Safe Zones OS** | ✅ 1-click pack switcher (`shorts_reels`, `youtube_long`, `podcast_clip`, `ad_ugc`, `tutorial`) in `editorStore`, `VideoCanvas` safe zone guides, caption presets, and LUFS target |
| **MediaGraph Scene-Cut & Hook Energy Facets** | ✅ Scene-cut boundaries & hook energy peaks in `MediaGraph` + zero-LLM `ACT` on "find the best hook" in `DecisionService` |
| **ADR-006 Native Function Calling Harness** | ✅ Bounded FunctionDeclaration schemas + zero-spend validity benchmark (`benchmark_native_tools.py`) |
| **Stripe & LemonSqueezy Webhooks** | ✅ Signature-verified webhook endpoints (`/api/billing/stripe/webhook`, `/api/billing/lemonsqueezy/webhook`) with idempotent Firestore tier/credit grants |
| CI BE↔FE registry hash | ✅ |
| Auto-ensure Studio project (chat + export + ingest projectize) | ✅ |
| Heuristic invent suggestions → 410 | ✅ |
| Cloud Tasks render dispatch + private `min=0` worker | ✅ Live |
| Admin gate fail-closed + ADK generate credits fail-closed | ✅ (2026-07-25 audit) |
| Dub Video (ADR-014) shorts path | ✅ Code complete |
| Studio Genius OS Phase 1 (ADR-015) | ✅ Redis plans + multi-turn/stream + SFX preview + docked Dub |

## Production render plane (SoT)

| Layer | Truth |
|-------|-------|
| Dispatch | `RENDER_DISPATCH_MODE=cloud_tasks` (prod); RQ = **local/dev fallback only** |
| Worker | `quickai-worker` private OIDC, **min-instances=0**, request CPU, concurrency 1 |
| Wake path | Cloud Tasks queue `quickai-render` |
| Status / locks | Redis (Upstash) — not the execution plane |

> Superseded (2026-07-22+): any doc claiming worker `min=1` + always-on RQ listener as production SoT.

## Ops handoff — founder-owned

- [x] `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1` on Vercel (2026-07-20)
- [x] `STUDIO_PROJECT_KERNEL=1` on Cloud Run API (+ worker)
- [x] Redis Upstash TLS
- [x] API `min-instances=0` + cpu-throttling
- [x] Worker Cloud Tasks cutover (`min=0`)
- [ ] **Gemini prepayment top-up** at https://ai.studio/projects — unblock analyze + AI chat
- [ ] **Rotate `ADMIN_SECRET`** — value previously recorded in docs; set new secret on Cloud Run only (never commit)
- [ ] **Enable `MEDIA_PROXY_AUTH_REQUIRED=true`** on Cloud Run after Vercel FE with `getAuthedProxyVideoUrl` is deployed (FinOps)
- [ ] Approve Legacy `Projects` / GridFS `/api/v1/video` cutover delete

## Code hardening backlog (engineering — no product redesign)

| Priority | Item | Gate |
|----------|------|------|
| Critical | ~~Commit `render_service_app.py`~~ ✅ `39be105` | Done |
| High | ~~Auth WIP (`mintBackendToken` / `authenticatedFetch`)~~ ✅ Shipped | Done |
| High | ~~Rate-limit or auth public bandwidth endpoints~~ ✅ Rate limits + HMAC media token (`3a522ca`) | Done (flip `MEDIA_PROXY_AUTH_REQUIRED=true` in ops) |
| Medium | ~~Edit-contract E-1/E-2/E-3 + ModePack sanitiser canvas bounds~~ ✅ | Done |
| Medium | Align FE/BE Kernel flag defaults documentation | Engineering |
| Medium | Dual export path docs (server primary; MediaRecorder/FFmpeg.wasm fallback) | Engineering |
| Low | Remove `_archive` ADK wizard + orphan `uploadVideo` client | Engineering |

## Next cycle

| Item | Gate |
|------|------|
| Live Gemini `generateContent` | **Founder top-up** |
| `GOOGLE_TTS_API_KEY` on API + worker | **Founder** — required for full Dub Video voice |
| Dub Video live smoke (translate+TTS+export) | After Gemini + TTS secrets |
| ADR-006 native Gemini FunctionDeclaration (tool-loop) | Phase 2 after ADR-015 |
| **Tier 1 media outcome verify** (post-execute observe vs intent) | Product rule + founder |
| Speaker `AUTO_REFRAME` | Not emit-allowed; preview refuses — do not fake |
| Movie-length (1–2hr) dub EP | Deferred — not ADR-014 shorts |
| Multiplayer | **Founder** (EP-007) |
| Legacy Projects / GridFS delete | **Founder** |

## Deferred UI

Coming Soon placeholders for intentionally deferred features (incl. planned ADK workspace). Non-interactive; must not imply live functionality.


---

## Founder north-star roadmap — strategic target (added 2026-11-20)

This is a target sequence, not an implementation-status claim. Promote work into an active cycle only after source audit, accepted ADR where required, acceptance tests, cost estimates and rollback planning.

| Order | Workstream | Required outcome | Gate |
|---|---|---|---|
| 0 | Fresh integrity audit | Reconcile source/docs; audit billing, webhook delivery, tenant authZ, storage IAM, logs, spend guardrails and deploy state | Evidence-backed P0/P1 list; no destructive cleanup |
| 1 | Finance integrity | Reconcile plan catalog, provider events, credit lifecycle and separate double-entry cash ledger | Idempotency, replay recovery, settlement reconciliation, contribution margin |
| 2 | Decision → plan → execute → verify | One conversational lifecycle using DecisionRecord, EP-001, Project Document, MediaGraph, Orchestrator and RenderManifest | No parallel ABI/state/queue; objective-level verification |
| 3 | Multimodal project intelligence | Supported image/audio/document/video inputs with evidence provenance | Format matrix, file safety, prompt-injection defense, cost and privacy budgets |
| 4 | Editing capability expansion | Prioritized media, audio, image, translation and dubbing capabilities | Registry contracts, sanitization, undo/recovery and quality corpus |
| 5 | Independent output QA | Verify actual edits and rendered outcomes, not just job acknowledgments | False-pass, sync, captions, render integrity and human review |
| 6 | Global and cross-device usability | Responsive, accessible, device-aware experience and measured localization/rollout | Browser/device matrix, accessibility, region/legal/payment readiness |
| 7 | Behavioral Intelligence | Learn user-controlled editing preferences and find UX friction | Transparency, consent, reset/delete, no sensitive-trait profiling |
| 8 | Business ops and growth | Contract-backed vendor/brand/affiliate tracking, campaign drafts and cost dashboard | Owner approval, attribution evidence and unit economics |
| 9 | Advanced dubbing/workflows | Multi-speaker/long-form dubbing and reusable workflows | Rights, consent, quality, latency and cost validation |

### First implementation cycle recommendation

1. Audit money and security paths before enabling autonomous side effects.
2. Verify webhook durability/retry/idempotency and subscription/credit lifecycle.
3. Design and test a separate double-entry cash ledger; credits remain separate.
4. Close high-risk tenant, storage, log-redaction, upload and worker-isolation findings.
5. Complete post-execution objective verification for high-value edit tasks.
6. Expand multimodal support only against a measured format/device QA corpus.

No payment provider, revenue percentage, model or cloud region is permanently mandated here. Decide only from current evidence, business eligibility, unit economics and accepted ADRs.
