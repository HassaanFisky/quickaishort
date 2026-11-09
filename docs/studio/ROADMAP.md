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
