# Sentry Setup

Production error monitoring across the frontend (Next.js) and backend
(FastAPI + Celery workers). For the existing Prometheus metrics and the
FFmpeg-error-classification detail already wired into Celery workers, see
[`OBSERVABILITY.md`](./OBSERVABILITY.md) — this doc only covers what's new
in Phase 47: frontend capture, and the env vars needed to turn everything on.

## Current state

- **Backend (`fastapi/main.py`, `fastapi/services/observability.py`)** — already
  fully wired: `sentry_sdk.init(...)` with `FastApiIntegration` runs at app
  startup, and `init_sentry_for_celery()` wires the Celery worker separately.
  Both are no-ops until `SENTRY_DSN` is set — `sentry_sdk.init(dsn=None)` is a
  documented no-op, so this is safe to leave running unconditionally.
- **Frontend (`frontend/sentry.{client,server,edge}.config.ts`,
  `next.config.mjs`)** — added in Phase 47. Each config file is a no-op
  unless `NEXT_PUBLIC_SENTRY_DSN` is set. `ErrorBoundary.tsx` calls
  `Sentry.captureException` on every caught render error;
  `lib/analytics.ts` calls `Sentry.captureMessage` (level `"warning"`) for
  every `editor_error` event, regardless of the analytics opt-out — error
  monitoring is not "usage telemetry" and should never be silenced by that
  toggle.

## Env vars required

| Var | Where | Notes |
|---|---|---|
| `SENTRY_DSN` | FastAPI (`fastapi/.env` / Cloud Run env) | Backend project DSN. |
| `NEXT_PUBLIC_SENTRY_DSN` | Next.js (`.env.local` / Vercel) | Frontend project DSN. Can be the same Sentry project as the backend, or a separate one — either works, separate projects give cleaner issue grouping. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Next.js build env (optional) | Only needed if source-map upload is enabled later (currently disabled in `next.config.mjs` — no `SENTRY_AUTH_TOKEN` exists yet). |
| `ENV` | FastAPI | Already used elsewhere; now also passed to Sentry as the `environment` tag (`development` if unset). |

Until these are set, every Sentry call in this codebase is a documented,
intentional no-op — nothing crashes, nothing silently fails to build.

## What's NOT enabled (and why)

- **Session Replay is disabled** (`replaysSessionSampleRate: 0`,
  `replaysOnErrorSampleRate: 0`) — Replay records a DOM/visual reconstruction
  of the user's session. This product's whole pitch is "your raw media never
  leaves your device" (see settings → Privacy tab); shipping Replay would
  contradict that promise even though Sentry's recording is DOM-based, not a
  literal screen capture. If this changes, it needs its own explicit
  sign-off — don't flip it on as part of a routine Sentry version bump.
- **The Sentry webpack plugin is skipped entirely at build time** unless
  `SENTRY_AUTH_TOKEN` is set — `next.config.mjs` checks for it and exports
  the plain `nextConfig` otherwise. Without a token, the plugin has nothing
  to authenticate with but still tries to phone home for telemetry/org
  auto-detection, which hung a local build for 12+ minutes during Phase 47
  testing before this guard was added. Source-map upload (and therefore
  de-minified stack traces) only turns on once `SENTRY_AUTH_TOKEN` exists.

## Alert rules to configure in the Sentry dashboard

These are dashboard configuration, not code — set them up once a project
exists:

- **Error rate > 5/min** → email Hassaan
- **New error type appears** (first occurrence of a previously-unseen
  fingerprint) → Slack `#alerts` (requires connecting the Slack integration
  in Sentry's org settings first)
- **Performance: p95 > 3s on `/editor`** → email Hassaan (uses the
  `tracesSampleRate: 0.1` performance data from `sentry.client.config.ts`)

## Verifying it's live

```bash
# Frontend — after setting NEXT_PUBLIC_SENTRY_DSN and restarting the dev server:
# Throw inside any client component and confirm it shows up in the Sentry dashboard.

# Backend — after setting SENTRY_DSN:
curl -X POST https://your-api.../api/preflight -d '{}' -H 'Content-Type: application/json'
# A malformed payload should 422 locally AND show up as a captured event in Sentry.
```
