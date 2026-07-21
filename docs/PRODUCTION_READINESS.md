# QuickAI Short — Production Readiness Checklist

> Prefer live gates in [`docs/studio/15-production-readiness.md`](studio/15-production-readiness.md) and [`docs/studio/ROADMAP.md`](studio/ROADMAP.md). This checklist is an older ops gate — verify claims against current code before treating unchecked boxes as blockers.

This checklist should be reviewed before major production cuts (billing, irreversible migrations, public launch changes).

---

## 1. Codebase Integrity
- [ ] Run `git status` and verify that the working tree is clean.
- [ ] Run typescript checks and verify production Next.js build is successful with zero errors:
  ```bash
  cd frontend && npx tsc --noEmit && pnpm build
  ```
- [ ] Run backend tests and verify all 71 tests pass successfully:
  ```bash
  cd fastapi && venv\Scripts\python -m pytest tests/ -q
  ```
- [ ] Run the Adobe trademark compliance check to verify no banned words are used:
  ```bash
  grep -rEni "premiere|lumetri|after.?effects|adobe" frontend/src/ --include="*.tsx" --include="*.ts" --include="*.css"
  # Must return completely empty
  ```
- [ ] Ensure that no console logs leak without process environment guards. Run:
  ```bash
  grep -rn "console\." frontend/src/lib/i18n.ts frontend/src/components/layout/Navbar.tsx 2>/dev/null | grep -v "process.env.NODE_ENV"
  # Must return completely empty
  ```

---

## 2. Platform & Integration Configs

### Paddle Billing Integration
- [ ] Verify Paddle Sandbox testing: end-to-end upgrade flow works (signup → mock checkout → webhook processed).
- [ ] Ensure the correct `PADDLE_WEBHOOK_SECRET` (the public key from the Paddle dashboard) is set in backend environment variables.
- [ ] Ensure `PADDLE_API_KEY` is set to manage customer portal sessions (cancel/invoices).

### Email Integration (Resend)
- [ ] Ensure Resend account is active, sender domain verified, and `RESEND_API_KEY` set.
- [ ] Ensure `RESEND_FROM_ADDRESS` is configured correctly (e.g. `onboarding@quickaishort.online`).

### Error Tracking (Sentry)
- [ ] Ensure Sentry projects are created for both Next.js and FastAPI.
- [ ] Verify `SENTRY_DSN` is set on Cloud Run and `NEXT_PUBLIC_SENTRY_DSN` is configured on Vercel.

---

## 3. Environment Variables Sync

### Vercel Frontend Environment Variables
- [ ] `NEXT_PUBLIC_API_URL` (URL of deployed Cloud Run API service)
- [ ] `ADMIN_SECRET` (Shared secret used to authorize backend admin calls)
- [ ] `NEXT_PUBLIC_SENTRY_DSN` (Sentry client key)
- [ ] `NEXTAUTH_SECRET` (NextAuth cryptography signature secret)
- [ ] `NEXTAUTH_URL` (`https://quickaishort.online`)
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google Auth Credentials)
- [ ] `MONGODB_URI` (Production MongoDB connection string)
- [ ] `NEXT_PUBLIC_PUSHER_KEY` / `NEXT_PUBLIC_PUSHER_CLUSTER` (Pusher WebSockets keys)

### GCP Cloud Run Environment Variables (Both API & Worker)
- [ ] `ENVIRONMENT=production`
- [ ] `ENV=production`
- `GOOGLE_CLOUD_PROJECT=quickaishort-agent-494304`
- [ ] `GCS_BUCKET_NAME=quickaishort-agent-494304-media`
- [ ] `ADMIN_SECRET` (Matching frontend `ADMIN_SECRET`)
- [ ] `SENTRY_DSN` (Sentry backend key)
- [ ] `RESEND_API_KEY` (Resend API client key)
- [ ] `RESEND_FROM_ADDRESS`
- [ ] `PADDLE_WEBHOOK_SECRET`

---

## 4. Deployment Execution Flow

Once the checklist above is fully resolved:
1. **Enable GCP Billing**: Link your active billing account to the `quickaishort-agent-494304` project.
2. **Deploy Backend first**:
   - Run `./deploy_production.sh` (or `./deploy_production.ps1` on Windows).
   - This ensures the rendering services are live.
3. **Verify Backend health**:
   - Run `curl -s https://quickai-api-y2cgnbsbxa-uc.a.run.app/health` and verify the status fields return `connected` / `ready` / `configured`.
4. **Deploy Frontend**:
   - Deploy to Vercel via CLI or git push.
5. **Run End-to-End Smoke Test**:
   - Visit the site, verify translations, sign up via a referral link, run a clip analysis, trigger Paddle subscription activation, verify both users receive the 100 bonus credits in MongoDB/Firestore, and confirm welcome emails are sent.
