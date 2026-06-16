import * as Sentry from "@sentry/nextjs";

// No-op without a DSN — safe to ship with this file present even before
// Hassaan provisions a Sentry project. See docs/SENTRY_SETUP.md.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0, // disabled — privacy (no session video recording)
    replaysOnErrorSampleRate: 0, // disabled for the same reason; stack traces are enough
    integrations: [Sentry.browserTracingIntegration()],
    environment: process.env.NODE_ENV,
  });
}
