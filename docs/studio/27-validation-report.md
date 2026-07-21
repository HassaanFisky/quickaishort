# 27 — Validation Report (Docs vs Code)

**Audit date:** 2026-07-21 (refresh)  
**Prior audit:** 2026-07-18  
**Method:** File reads + greps + live `/health` probes.

---

## Classification legend

| Tag | Meaning |
|-----|---------|
| ✅ Accurate | Matches code |
| ⚠️ Partial | Partly true / incomplete |
| ❌ Outdated | Contradicted by code |
| ❓ Unverified | Needs live or deeper check |

---

## Root / CLAUDE claims (2026-07-21)

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Next.js 14.2.35 | ✅ | `frontend/package.json`; CLAUDE corrected |
| NextAuth JWT via `services/auth.py` | ✅ | `fastapi/services/auth.py`; CLAUDE corrected (was wrongly `firebase_auth.py`) |
| GCS primary for /adk + /editor | ✅ | `db.py`, upload/export paths; `/health` → `gcs:true` |
| GridFS only legacy `/api/v1/video/*` | ✅ | `routers/video.py` |
| ADK Pre-Flight loop exists | ✅ | `preflight_agent.py` |
| Pipeline JWT + fail-closed credits | ✅ | `pipeline_router.py` |
| AI Editor fail-closed credits + stream gate | ✅ | `ai_editor_router.py` (2026-07-21) |
| Ingest = `IngestSurface` (upload + URL) | ✅ | EP-008; orphan `YouTubeInputStrip` removed |
| ADK sidebar Coming Soon blur | ✅ | `ComingSoonGate` / `AdkComingSoonWorkspace` |
| Gemini live AI | ❌ blocker | **429 prepayment credits depleted** — founder top-up required |
| google-adk ≥2.1.0 | ✅ | `requirements.txt` `google-adk[bigquery]>=2.1.0` |

---

## Live probes (2026-07-21)

| Endpoint | Result |
|----------|--------|
| `quickai-api …/health` | 200 — mongo/redis/adk/gcs true |
| `quickai-worker …/health/ready` | 200 — redis true, queue `render_queue` |
| Frontend `quickaishort.online` | Live |

---

## Historical notes (do not treat as current)

- 2026-05-29 “billing delinquent / API_KEY_INVALID” — **superseded**; GCS healthy; Gemini issue is **429 credits**.
- `PRODUCTION_STATUS.md` (2026-05-24) — archive only.
- `VISION.md` Studio claims — superseded by `docs/studio/01-product-vision.md`.

---

## Still open (non-code)

1. Gemini credit top-up → live demo  
2. Demo video 2:50–3:00  
3. Devpost + Google for Startups form  
4. Founder consent before deleting legacy Firestore `Projects`
