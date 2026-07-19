# 11 — Security

## AuthN / AuthZ summary

| Layer | Mechanism | File |
|-------|-----------|------|
| FE session | NextAuth | `frontend/src/lib/auth/options.ts` |
| API user | Bearer JWT HS256 | `fastapi/services/auth.py` |
| Admin | Shared secret header | `ADMIN_SECRET` |
| Downloads | HMAC signing | `services/signing.py` |
| Billing webhook | Paddle signature | `routers/billing.py` |

---

## Verified issues

| Issue | Severity | Evidence | Fix |
|-------|----------|----------|-----|
| `POST /api/pipeline/run` unauthenticated | **High** | `pipeline_router.py` | Add `Depends(get_verified_user_id)` + credit checks |
| `AUTH_DISABLED` documented but not coded | Medium | `.env.example` vs `auth.py` | Implement or remove from docs |
| CLAUDE.md references `firebase_auth.py` | Medium (doc) | File absent | Correct docs |
| Storage URI spoof (`gridfs://` for GCS) | Medium | youtube/tts paths | Emit `gs://` only |
| Credit deduction soft-fail proceeds | Medium | ai_editor_router try/except | Fail closed in production |

---

## Secrets handling

- Secrets in `.env` / Cloud Run env / Vercel — not in git.  
- Pre-push scan recommended: `git diff --cached | grep -iE "(api_key|secret|token|password)"`  
- Never prefix private keys with `NEXT_PUBLIC_`  

See also root `SECURITY.md` — validate claims against code before trust.

---

## Abuse / cost controls

- `slowapi` rate limits  
- Credits via Firestore `deduct_credits`  
- AI editor 402 on insufficient credits (when deduction works)  

---

## Trademark / compliance note

`docs/PRODUCTION_READINESS.md` requires grep ban on Premiere/Adobe terms in FE source. Keep compliance check in release gate.

---

## ADK unfinished UI

When ADK (Google Agent Development Kit) workspace is shown before orchestration is ready: must ship blurred + Coming Soon; no live agent execution hooks until ready. **Not an advertisements surface.**
