# 27 — Validation Report (Docs vs Code)

**Audit date:** 2026-07-18  
**Method:** File reads + greps. Live production probes: **not run** this session → any uptime/billing claim = Insufficient evidence.

---

## Classification legend

| Tag | Meaning |
|-----|---------|
| ✅ Accurate | Matches code |
| ⚠️ Partial | Partly true / incomplete |
| ❌ Outdated | Contradicted by code |
| ❓ Unverified | Needs live or deeper check |

---

## Root / CLAUDE claims

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Next.js 14.2.22 | ❌ | `frontend/package.json` = **14.2.35** |
| `firebase_auth.py` validates tokens | ❌ | File absent; `services/auth.py` NextAuth JWT |
| GCS primary for /adk + /editor | ✅ | `db.py`, upload/export paths |
| GridFS only legacy `/api/v1/video/*` | ✅ | `routers/video.py` |
| ADK Pre-Flight loop exists | ✅ | `preflight_agent.py` |
| Render DLQ + admin endpoints | ✅ | `render_queue.py`, main routes |
| `AUTH_DISABLED` skips JWT | ❌ (as implemented) | Documented in `.env.example`, not in `auth.py` |
| pipeline frontend unwired | ❓ | Router exists; FE caller not exhaustively proven absent |
| Billing delinquent / Gemini invalid | ❓ | Historical CLAUDE note — re-verify live |
| google-adk 1.0 | ❌ in deps | `requirements` has `google-adk[bigquery]>=2.1.0` |

---

## ARCHITECTURE.md

| Claim | Verdict |
|-------|---------|
| Pre-Flight Sequential/Loop/Parallel topology | ⚠️ — topology exists; FunctionTool details may be simplified/stale |
| Stack Next 14.2.22 / ADK 1.0 | ❌ version pins |
| SerpAPI + YouTube Analytics FunctionTools | ❓ re-read `preflight_agent.py` tool wiring before marketing |

---

## VISION.md

| Claim | Verdict |
|-------|---------|
| Shorts + Pre-Flight mission | ✅ historical product |
| Studio chat-primary NLE | ❌ not this document’s intent — superseded by `01-product-vision.md` |

---

## README.md

| Claim | Verdict |
|-------|---------|
| Live product description Pre-Flight | ⚠️ still core but incomplete vs Studio |
| CI badge `ci.yml` | ❓/❌ workflow may be missing — only `linter.yml` + `deploy-video-pipeline.yml` found |
| ADK 1.0 badge | ⚠️ deps ≥2.1.0 |

---

## docs/VIDEO_API.md

| Claim | Verdict |
|-------|---------|
| GridFS upload flows | ⚠️ true for v1; misleading if read as primary Studio path |

---

## PRODUCTION_STATUS.md (2026-05-24)

Historical snapshot — treat as **archive**, not current. Endpoint PASS table = ❓ today.

---

## Code facts confirmed this audit

1. AI editor returns JSON; FE `applyAiEdits` executes.  
2. Native Gemini function calling absent on AI editor path.  
3. Instant suggestions = title heuristic map.  
4. Advanced panels gated by `?advanced=1`.  
5. No Ads nav item; Coming Soon on Agency pricing only.  
6. RenderManifest partially consumed by worker.  
7. Pipeline run endpoint lacks JWT dependency.

---

## Documentation platform status

| Item | Status |
|------|--------|
| Prior dedicated Studio docs platform | ❌ did not exist; created `docs/studio/` |
| Duplicate/misleading legacy docs | ⚠️ retained; classified here |
| This validation report | ✅ baseline for AntiGravity |
