# QuickAI Short — Security Policy

Security and privacy for the production **QuickAI Short** platform (evolving toward **QuickAI Studio** on the same codebase).

---

## 1. Authentication & sessions

- **Identity:** NextAuth.js (OAuth providers as configured in the frontend).
- **Backend auth:** FastAPI validates NextAuth **HS256 JWTs** via `fastapi/services/auth.py` (`NEXTAUTH_SECRET` shared). Protected routes use verified user id from the token — not trustable body fields alone.
- Session cookies use `HttpOnly`, `Secure` (production), and appropriate `SameSite` settings.
- CORS restricted to configured origins (production domains such as `*.quickaishort.online`).
- Rate limiting applied at gateway / application layers where configured.

---

## 2. Privacy

- Collect minimal PII required for accounts (e.g. email, display name).
- Do not build advertising profiles from user transcripts or video content.
- Prefer non-identifying ids in operational logs where practical.

---

## 3. Storage & encryption

| Store | Role |
|-------|------|
| **GCS** | **Primary** media for editor/export/TTS (`quickaishort-agent-494304-media`). Private objects + time-bounded signed download URLs. |
| **MongoDB GridFS** | **Legacy only** — `/api/v1/video/*` path. Not the primary media plane. |
| **Firestore** | Agent session state (and some product stats paths). |
| **Redis** | Job queue and status — no long-term media blobs. |

Cloud Run containers are ephemeral; do not rely on local disk for durable media.

---

## 4. Retention (policy intent)

Exact cron implementations may vary; product intent:

| Class | Intent |
|-------|--------|
| Uploads / intermediates | Short-lived; purge after processing windows |
| Exports | User-controlled + bounded retention |
| Logs / telemetry | Rotated on a short operational window |

User deletion requests should cascade related media metadata and objects where implemented.

---

## 5. Secrets & supply chain

- Production secrets via GCP Secret Manager / Vercel env — never commit plaintext keys.
- CI should fail on obvious secret patterns in diffs.
- Subprocess calls (`yt-dlp`, ffmpeg) must use safe argument construction.
- API errors sanitized — no stack traces or internal paths to clients.

---

## 6. Responsible disclosure

Report vulnerabilities privately to the maintainer (Hassaan Fisky / project security contact). Do not open public issues with exploit detail before coordinated disclosure.

---

## Related

- [`docs/studio/11-security.md`](docs/studio/11-security.md)  
- [`docs/studio/adrs/ADR-002-gcs-primary-storage.md`](docs/studio/adrs/ADR-002-gcs-primary-storage.md)  
- [`docs/studio/adrs/ADR-003-nextauth-jwt-auth.md`](docs/studio/adrs/ADR-003-nextauth-jwt-auth.md)  
