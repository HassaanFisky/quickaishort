# 11 — Security

**Last verified:** 2026-08-01 (code-grounded)

## AuthN / AuthZ summary

| Layer | Mechanism | File |
|-------|-----------|------|
| FE session | NextAuth | `frontend/src/lib/auth/options.ts` |
| API user | Bearer JWT HS256 — **sole tenant authority** | `fastapi/services/auth.py` |
| Admin | Shared secret header | `ADMIN_SECRET` (`X-Admin-Secret`) |
| Downloads | HMAC signing | `services/signing.py` |
| Billing webhook | Paddle signature | `routers/billing.py` |
| Renderer | Cloud Tasks OIDC → private Cloud Run | `services/render_dispatch.py` |

---

## Verified controls (current)

| Control | Status | Evidence |
|---------|--------|----------|
| `POST /api/pipeline/run` JWT + credits | **Closed** | `pipeline_router.py` → `Depends(get_verified_user_id)` + fail-closed deduct |
| Body `userId` / `user_id` as tenant | **Closed** | `main.py` analyze / process-video / preflight / direct / create-video use JWT only |
| Prod OpenAPI (`/docs` `/redoc` `/openapi.json`) | **Closed when `ENVIRONMENT=production`** | `main.py` FastAPI constructor |
| FE CSP report-only + HSTS + Permissions-Policy | **Shipped** | `frontend/next.config.mjs` |
| Credit fail-closed before model (AI Editor) | **Shipped** | `ai_editor_router.py` + FE zero-credit send disable |
| Prod mock kill-switch | **Shipped** | `core/flags.py` blocks `MOCK_AI_*` in production |
| GCS primary (not GridFS) for `/adk` + `/editor` | **Shipped** | ADR-002; GridFS = legacy `/api/v1/video/*` only |

---

## Residual / watch list

| Issue | Severity | Evidence | Fix |
|-------|----------|----------|-----|
| `AUTH_DISABLED` documented but not coded | Medium | `.env.example` vs `auth.py` | Remove from docs or implement (prefer remove) |
| Historical `firebase_auth.py` claim | Resolved | Auth = `services/auth.py` | Keep grep-clean |
| GCS bucket public ACL misconfig | P0 live check | Founder IAM audit | Confirm no `allUsers` objectViewer |
| CSP enforce (after report-only clean) | P1 | `next.config.mjs` | Flip header once console violations = 0 |
| Log PII / raw transcript at INFO | P1 | Agent/router logs | Ids-only redaction audit |

---

## Secrets handling

- Secrets in `.env` / Cloud Run env / Vercel — not in git.
- Pre-push scan: `git diff --cached | grep -iE "(api_key|secret|token|password)"`
- Never prefix private keys with `NEXT_PUBLIC_`
- Rotate immediately if ever committed/logged: `GEMINI_API_KEY`, `NEXTAUTH_SECRET`, `ADMIN_SECRET`, `EXPORT_SIGNING_SECRET`

See also root `SECURITY.md` — validate claims against code before trust.

---

## Abuse / cost controls

- `slowapi` rate limits + tenant token buckets (`middleware/cost_guard.py`)
- Credits via Firestore — fail-closed before Gemini on AI editor + analyze/preflight/direct
- Gemini backpressure circuit (`gemini_backpressure.py`) — 429/503 surfaced to UI
- Free tier: fixed capability matrix (720p + watermark + storage boundary) — see `core/limits.py`
- Render: Cloud Tasks named-task dedupe + `runId` cancel — no always-on RQ in production

---

## Trademark / compliance note

`docs/PRODUCTION_READINESS.md` requires grep ban on Premiere/Adobe terms in FE source. Keep compliance check in release gate.

---

## ADK unfinished UI

When ADK (Google Agent Development Kit) workspace is shown before orchestration is ready: must ship blurred + Coming Soon; no live agent execution hooks until ready. **Not an advertisements surface.**
