# QuickAI Studio — Security Policy

Security, tenant isolation, and data privacy policy for **QuickAI Studio** (formerly QuickAI Short, deployed at [quickaishort.online](https://www.quickaishort.online)).

---

## 1. Authentication & Session Boundaries

- **Identity:** NextAuth.js (`frontend/src/lib/auth/options.ts`) supporting Google OAuth and email/password credentials.
- **Route Protection:** `frontend/src/middleware.ts` enforces valid NextAuth JWT sessions on `/dashboard`, `/editor`, `/projects`, `/history`, `/settings`, `/billing`, and `/adk` unconditionally in production.
- **Backend Verification:** FastAPI validates NextAuth **HS256 JWTs** via `fastapi/services/auth.py` using the shared `NEXTAUTH_SECRET`. Protected routes derive user identity strictly from verified JWT claims (`Depends(get_verified_user_id)`), never from untrusted client headers or body fields.
- **Media Proxy Fail-Closed:** `/api/proxy-media` enforces authentication by default (`MEDIA_PROXY_AUTH_REQUIRED=true`).
- **Rate-Limit Spoofing Prevention:** `fastapi/core/rate_limit.py` uses socket peer IP by default and only parses `X-Forwarded-For` (rightmost valid hop) when explicitly configured behind a trusted proxy (`TRUST_PROXY_HEADERS=true`).
- **Upstream URL Whitelisting:** `fastapi/services/video_service.py` enforces strict hostname whitelisting (`youtube.com`, `youtu.be`, `tiktok.com`) before invoking `yt-dlp` to prevent SSRF.

---

## 2. Privacy & AI Data Handling

- Collect minimal PII required for accounts (email, display name, profile avatar).
- Do not build advertising profiles from user transcripts or video content.
- Never train proprietary models on user content, transcripts, or media without explicit consent.

---

## 3. Storage & Tenant Isolation

| Store | Role |
|-------|------|
| **GCS** | **Primary** cloud media store (`quickaishort-agent-494304-media`). Private objects + time-bounded signed download URLs. |
| **Local Storage (`.quickai_studio/`)** | Local-first execution mode (`LOCAL_FIRST_MODE=1`). Uploads and render jobs are scoped per authenticated `user_id` and verified against path traversal and cross-tenant access. |
| **MongoDB** | User accounts, saved project drafts, export history, and legacy GridFS (`/api/v1/video/*` only). |
| **Firestore** | UserStats / credits / Studio Kernel persistence (falls back to SQLite in `LOCAL_FIRST_MODE=1`). |
| **Redis** | Render status, cancellation locks, and rate-limit counters — no long-term media blobs. |

---

## 4. Retention Policy

| Class | Policy Intent |
|-------|---------------|
| Uploads / intermediates | Short-lived; purged after processing windows |
| Exports | User-controlled deletion + bounded retention |
| Logs / telemetry | Rotated on a short operational window |

---

## 5. Secrets & Supply Chain

- Production secrets are managed via GCP Secret Manager and Vercel environment variables — never commit plaintext keys or `.env` files.
- Subprocess invocations (`yt-dlp`, `ffmpeg`, `ffprobe`) use strict argument arrays (`shell=False`) and fail closed on missing binaries or corrupt media.
- API error responses are sanitized so internal stack traces and filesystem paths are not leaked to clients.

---

## 6. Responsible Disclosure

Report security vulnerabilities privately to the maintainer (`contact@quickaishort.online`). Do not open public issues containing exploit details prior to coordinated remediation.

---

## Related Documentation

- [`docs/studio/11-security.md`](docs/studio/11-security.md)  
- [`docs/studio/adrs/ADR-002-gcs-primary-storage.md`](docs/studio/adrs/ADR-002-gcs-primary-storage.md)  
- [`docs/studio/adrs/ADR-003-nextauth-jwt-auth.md`](docs/studio/adrs/ADR-003-nextauth-jwt-auth.md)  
