# QuickAI Short — Production Deployment Guide

This document defines the final deployment procedure for both the backend (GCP Cloud Run) and the frontend (Vercel) for the QuickAI Short production application.

---

## ⚠️ GCP Billing Recovery (Prerequisite)

Before deploying the backend, billing **must** be re-enabled on the GCP project. If billing is disabled, you will encounter `BillingDisabled` errors when running the deployment.

To check and recover from disabled billing:
1. Ensure your billing account is active.
2. Link the billing account to the project:
   ```bash
   gcloud billing projects link quickaishort-agent-494304 --billing-account=[YOUR_BILLING_ACCOUNT_ID]
   ```
3. Verify project configuration and access:
   ```bash
   gcloud config set project quickaishort-agent-494304
   gcloud run services list --region us-central1
   ```

---

## 1. Backend Deployment (GCP Cloud Run)

The backend runs as two services on GCP Cloud Run using the same Docker container built via Cloud Build:
1. `quickai-api`: The web request handler.
2. `quickai-worker`: The rendering queue processor.

### One-Command Deployment

Depending on your host operating system, execute the following script from the project root:

**Linux / macOS / Git Bash:**
```bash
./deploy_production.sh
```

**Windows PowerShell:**
```powershell
./deploy_production.ps1
```

### Required Backend Environment Variables (configured in Cloud Run)

- `ENVIRONMENT`: `production`
- `ENV`: `production`
- `GOOGLE_CLOUD_PROJECT`: `quickaishort-agent-494304`
- `GCS_BUCKET_NAME`: `quickaishort-agent-494304-media`
- `ADMIN_SECRET`: The shared API secret to authorize admin endpoints (e.g. email, referral bonuses, latency).
- `SENTRY_DSN`: Sentry connection URL for backend crash reporting.
- `RESEND_API_KEY`: API key for transaction-based emails.
- `RESEND_FROM_ADDRESS`: Default verified sender (e.g., `onboarding@quickaishort.online`).
- `PADDLE_WEBHOOK_SECRET`: The Ed25519 public key obtained from the Paddle dashboard.

---

## 2. Frontend Deployment (Vercel)

The Next.js 14 frontend is hosted on Vercel. 

### Deployment Steps
1. Push all code to `main` on GitHub:
   ```bash
   git push origin main
   ```
2. Vercel will trigger a build automatically if GitHub integration is active. Alternatively, deploy via Vercel CLI from the `frontend` directory:
   ```bash
   vercel --prod
   ```

### Required Frontend Environment Variables (configured in Vercel Dashboard)

- `NEXT_PUBLIC_API_URL`: The URL of the deployed `quickai-api` service (e.g. `https://quickai-api-y2cgnbsbxa-uc.a.run.app`).
- `ADMIN_SECRET`: The shared API secret matching the backend `ADMIN_SECRET` value.
- `NEXT_PUBLIC_SENTRY_DSN`: Sentry connection URL for client-side crash reporting.
- `NEXTAUTH_SECRET`: NextAuth signature key.
- `NEXTAUTH_URL`: Canonical site URL (`https://quickaishort.online`).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: OAuth credentials for Google Sign-In.
- `MONGODB_URI`: Production MongoDB connection string.
- `NEXT_PUBLIC_PUSHER_KEY` / `NEXT_PUBLIC_PUSHER_CLUSTER`: Pusher configuration for real-time WebSocket state synchronization.

---

## 3. Post-Deployment Verification (Smoke Tests)

To confirm that the production deployment was 100% successful, perform the following validation checks:

### Liveness Probe Check
Execute a GET request to the backend health endpoint:
```bash
curl -s https://quickai-api-y2cgnbsbxa-uc.a.run.app/health
```
Ensure the response returns HTTP 200 with the following shape:
```json
{
  "status": "ok",
  "mongo": true,
  "redis": true,
  "adk": true,
  "gcs": true,
  "firestore_status": "connected",
  "storage_status": "connected",
  "redis_status": "ready",
  "agent_ready_state": "ready",
  "build_sha": "[CURRENT_COMMIT_SHA]",
  "sentry": "configured"
}
```

### End-to-End User Flow Test
1. Visit [quickaishort.online](https://quickaishort.online).
2. Switch language to Spanish/French/Hindi via the Globe switcher in the navbar to verify i18n is functional.
3. Sign up using a referral link (e.g. `https://quickaishort.online/signup?ref=qs-xxx`) in incognito mode.
4. Perform a viral scan on a short YouTube URL.
5. Upgrade to Pro using the Paddle Sandbox checkout.
6. Verify:
   - Pro tier status is correctly granted.
   - Welcome/Pro Activation emails are dispatched.
   - Referral credits (100 credits) are added to both accounts in MongoDB and Firestore.
