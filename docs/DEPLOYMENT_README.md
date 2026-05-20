# Production Deployment Guide

Deploy the QuickAI Short video processing pipeline to Google Cloud Run with automated CI/CD.

**Status**: 🟢 Production Ready  
**Last Updated**: 2026-05-20  
**Deployment Type**: Cloud Run (serverless containers)

---

## Quick Start (5 minutes)

### 1. Prerequisites

```bash
# Install Google Cloud CLI
curl https://sdk.cloud.google.com | bash
gcloud init

# Install GitHub CLI
brew install gh  # macOS
# or download from https://cli.github.com

# Authenticate with GitHub
gh auth login
```

### 2. Setup Cloud Infrastructure

```bash
# Set your project ID
export PROJECT_ID="quick-ai-shorts-477012"

# Create Redis instance (Memorystore)
gcloud redis instances create quickaishort-redis \
  --size=1gb --region=us-central1 --redis-version=7.0

# Create MongoDB cluster (use Atlas instead: https://mongodb.com/cloud/atlas)
# Atlas is recommended for production
```

### 3. Add GitHub Secrets

```bash
cd /path/to/quickaishort
chmod +x scripts/setup-github-secrets.sh
./scripts/setup-github-secrets.sh
```

This interactive script will:
- ✅ Collect GCP credentials
- ✅ Collect Redis and MongoDB connection strings
- ✅ Generate secure random secrets
- ✅ Add all secrets to GitHub

### 4. Deploy

```bash
git push origin main
```

That's it! The GitHub Actions workflow will automatically:
- ✅ Build Docker images (FastAPI + Celery Worker)
- ✅ Run tests
- ✅ Deploy to Cloud Run
- ✅ Verify health checks

Monitor deployment:
- GitHub Actions tab: `https://github.com/HassaanFisky/quickaishort/actions`
- Cloud Run: `https://console.cloud.google.com/run`

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (Vercel)                     │
│                  quickaishort.online                    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ HTTP/REST
                       ▼
┌─────────────────────────────────────────────────────────┐
│          FastAPI API Server (Cloud Run)                 │
│              quickaishort-api                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ POST /api/v1/video/upload      Upload file      │   │
│  │ GET  /api/v1/video/task/{id}   Poll status      │   │
│  │ GET  /health                   Health check     │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────────┘
                   │
         ┌─────────┼─────────┐
         │         │         │
         ▼         ▼         ▼
    ┌────────┐ ┌────────┐ ┌──────────────┐
    │ Redis  │ │MongoDB │ │ Celery Tasks │
    │ (Broker)  (Storage)  (Worker)      │
    └────────┘ └────────┘ └──────────────┘
         │                      │
         │                      │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Celery Worker       │
         │  (Cloud Run Service) │
         │  ┌────────────────┐  │
         │  │ FFmpeg Filters │  │
         │  │ - Brightness   │  │
         │  │ - Contrast     │  │
         │  │ - Saturation   │  │
         │  │ - Hue          │  │
         │  │ - Blur         │  │
         │  └────────────────┘  │
         │  Outputs → GridFS    │
         └──────────────────────┘
```

---

## 📋 Files Overview

### Dockerfiles

| File | Purpose |
|------|---------|
| `fastapi/Dockerfile` | FastAPI API server (existing) |
| `fastapi/Dockerfile.worker` | **NEW**: Celery worker with FFmpeg |

### Deployment Configuration

| File | Purpose |
|------|---------|
| `fastapi/cloud-run-worker.yaml` | **NEW**: Kubernetes/Cloud Run config |
| `.github/workflows/deploy-video-pipeline.yml` | **NEW**: CI/CD automation |

### Documentation

| File | Purpose |
|------|---------|
| `docs/DEPLOYMENT_PIPELINE.md` | Complete deployment guide (100+ steps) |
| `docs/DEPLOYMENT_README.md` | This file (quick start) |
| `docs/VIDEO_API.md` | API endpoint documentation |
| `docs/VIDEO_API_QUICK_REFERENCE.md` | Developer cheat sheet |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/setup-github-secrets.sh` | **NEW**: Interactive secret setup |

---

## 🔐 Environment Variables

All secrets are managed via GitHub Secrets. The workflow passes them to Cloud Run services automatically.

### Required Secrets

```yaml
GCP_WORKLOAD_IDENTITY_PROVIDER   # OIDC federation for GitHub→GCP auth
GCP_SERVICE_ACCOUNT               # GCP service account email
REDIS_URL                         # redis://:password@host:6379/0
MONGODB_URI                       # mongodb+srv://user:pass@host
GEMINI_API_KEY                    # Google Gemini API key
EXPORT_SIGNING_SECRET             # Random 32+ char string
NEXTAUTH_SECRET                   # Random 32+ char string
PUSHER_APP_ID                     # (Optional) Pusher notifications
PUSHER_KEY                        # (Optional)
PUSHER_SECRET                     # (Optional)
PUSHER_CLUSTER                    # (Optional)
```

---

## 🚀 Deployment Workflow

### What Happens When You Push to Main

```
1. GitHub Actions Triggered
   ↓
2. Build FastAPI Image
   - Tests: type-check, lint, imports
   - Build: docker build -f Dockerfile
   - Push: to us-central1-docker.pkg.dev
   ↓
3. Build Celery Worker Image
   - Tests: imports, dependencies
   - Build: docker build -f Dockerfile.worker
   - Push: to us-central1-docker.pkg.dev
   ↓
4. Deploy FastAPI to Cloud Run
   - Service: quickaishort-api
   - Config: 4GB RAM, 2 vCPU, max 3 instances
   - Health Check: /health endpoint
   ↓
5. Deploy Celery Worker to Cloud Run
   - Service: quickaishort-worker
   - Config: 2GB RAM, 2 vCPU, max 3 instances
   - Task: celery -A workers.tasks worker
   ↓
6. Smoke Tests
   - Curl API health endpoint
   - Verify environment variables
   ↓
7. Success!
   - Both services running
   - Ready for production traffic
```

### Monitoring Deployment

**GitHub Actions**:
```bash
# View all workflow runs
gh run list --repo HassaanFisky/quickaishort

# View specific workflow
gh run view <RUN_ID> --log

# Stream real-time logs
gh run watch <RUN_ID>
```

**Cloud Console**:
```bash
# View API logs
gcloud run logs read quickaishort-api --region=us-central1 --limit=100

# View Worker logs
gcloud run logs read quickaishort-worker --region=us-central1 --limit=50

# Real-time stream
gcloud run logs read quickaishort-api --region=us-central1 --follow
```

---

## 🧪 Testing Deployment

### Test API Endpoint

```bash
# Get API URL
API_URL=$(gcloud run services describe quickaishort-api \
  --region=us-central1 --format='value(status.url)')

echo "Testing: $API_URL"

# Health check
curl -s "$API_URL/health" | jq .

# Expected response:
# {
#   "status": "ok",
#   "mongo": true,
#   "redis": true,
#   "adk": true
# }
```

### Test Video Upload

```bash
# Create test video
ffmpeg -f lavfi -i testsrc=s=1280x720:d=5 -pix_fmt yuv420p test.mp4

# Upload
curl -X POST \
  -F "file=@test.mp4" \
  -F "process_video=false" \
  "$API_URL/api/v1/video/upload" | jq .

# Expected response:
# {
#   "request_id": "abc123",
#   "file_id": "507f1f77bcf86cd799439011",
#   "filename": "test.mp4",
#   "task_id": null,
#   "message": "Video uploaded successfully"
# }
```

### Test Worker Processing

```bash
# Upload with processing
curl -X POST \
  -F "file=@test.mp4" \
  -F "process_video=true" \
  -F "frame_adjustments={\"brightness\":1.2,\"contrast\":1.1}" \
  "$API_URL/api/v1/video/upload" | jq .

# Get task_id from response, then poll
TASK_ID="d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e"

# Poll every 2 seconds until success
for i in {1..30}; do
  curl -s "$API_URL/api/v1/video/task/$TASK_ID" | jq .
  sleep 2
done
```

---

## 🛠️ Troubleshooting

### Deployment Failed

1. Check GitHub Actions logs:
   ```bash
   gh run view <RUN_ID> --log | tail -50
   ```

2. Check Cloud Run logs:
   ```bash
   gcloud run logs read quickaishort-api --region=us-central1 --limit=100
   ```

3. Common issues:
   - **"Redis connection refused"**: Check REDIS_URL secret, verify Redis is accessible
   - **"MongoDB connection timeout"**: Check MONGODB_URI, verify IP allowlist
   - **"GEMINI_API_KEY not configured"**: Verify API key is correct and enabled
   - **"Permission denied"**: Check GCP service account permissions

### API Not Responding

```bash
# Check service status
gcloud run services describe quickaishort-api --region=us-central1

# Check recent revisions
gcloud run revisions list --service=quickaishort-api --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic quickaishort-api \
  --to-revisions LATEST=0,<PREVIOUS_REVISION>=100
```

### Worker Not Processing Tasks

```bash
# Check worker status
gcloud run services describe quickaishort-worker --region=us-central1

# Verify Redis is working
redis-cli -u "$REDIS_URL" PING  # Should return PONG

# Check Celery tasks in queue
python -c "
from celery import Celery
app = Celery('quickaishort')
app.conf.broker_url = '$REDIS_URL'
print(app.control.inspect().active())
"

# Check worker logs
gcloud run logs read quickaishort-worker --region=us-central1 --limit=100
```

---

## 📊 Monitoring

### Cloud Monitoring Dashboard

Create a monitoring dashboard:

```bash
# Enable monitoring API
gcloud services enable monitoring.googleapis.com

# Create uptime check
gcloud monitoring uptime-checks create \
  --display-name="QuickAI API Health" \
  --monitored-resource="uptime-url" \
  --http-check='{"path":"/health"}' \
  --selected-regions="USA,EUROPE"
```

### View Metrics

```bash
# CPU usage
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count"'

# Request latency
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies"'
```

---

## 🔄 Continuous Deployment

The workflow runs on every push to `main`. To control deployments:

### Deploy Only API

```bash
# Edit workflow to skip worker, or use manual trigger:
gh workflow run deploy-video-pipeline.yml \
  -f deploy_api=true \
  -f deploy_worker=false
```

### Deploy Only Worker

```bash
gh workflow run deploy-video-pipeline.yml \
  -f deploy_api=false \
  -f deploy_worker=true
```

### Trigger Manual Deployment

```bash
gh workflow run deploy-video-pipeline.yml
```

---

## 📈 Scaling

### Increase Throughput

For higher video processing throughput, adjust Cloud Run configuration:

```bash
# API: increase concurrency
gcloud run services update quickaishort-api \
  --region=us-central1 \
  --max-instances=10 \
  --update-env-vars WEB_CONCURRENCY=4

# Worker: increase concurrency (careful with memory/CPU!)
gcloud run services update quickaishort-worker \
  --region=us-central1 \
  --max-instances=10 \
  --memory=4Gi \
  --cpu=4
```

### Reduce Costs

For lower traffic (dev/staging):

```bash
# API: reduce resources
gcloud run services update quickaishort-api \
  --region=us-central1 \
  --max-instances=1 \
  --memory=2Gi \
  --cpu=1

# Worker: reduce to on-demand only
gcloud run services update quickaishort-worker \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=2
```

---

## 🔒 Security Best Practices

### 1. Rotate Secrets Regularly

```bash
# Regenerate and update
NEW_SECRET=$(openssl rand -base64 32)
gh secret set EXPORT_SIGNING_SECRET --body "$NEW_SECRET"

# Redeploy (push to main triggers new deployment)
git commit --allow-empty -m "chore: rotate secrets"
git push origin main
```

### 2. Limit API Access

```bash
# Make API authenticated (currently public)
gcloud run services update quickaishort-api \
  --region=us-central1 \
  --no-allow-unauthenticated
```

### 3. Network Security

The workflow uses:
- ✅ Workload Identity Federation (no service account keys)
- ✅ HTTPS only (Cloud Run enforces)
- ✅ Network policies (restricts pod-to-pod traffic)

### 4. Audit Logging

Enable Cloud Audit Logs:

```bash
gcloud logging sinks create audit-log-sink \
  logging.googleapis.com/sites \
  --log-filter='resource.type="cloud_run_service"'
```

---

## 🧹 Cleanup

### Delete All Services

```bash
gcloud run services delete quickaishort-api --region=us-central1 --quiet
gcloud run services delete quickaishort-worker --region=us-central1 --quiet
gcloud redis instances delete quickaishort-redis --region=us-central1 --quiet
```

### Delete GitHub Secrets

```bash
gh secret list | awk '{print $1}' | xargs -I {} gh secret delete {}
```

---

## 📞 Support

- **Documentation**: See `docs/DEPLOYMENT_PIPELINE.md` for detailed setup
- **API Docs**: See `docs/VIDEO_API.md`
- **Issues**: Check GitHub Actions logs first, then `gcloud run logs`
- **Slack**: #infrastructure channel (if available)

---

## ✅ Deployment Checklist

- [ ] Google Cloud project created
- [ ] Service account configured
- [ ] Redis instance running
- [ ] MongoDB cluster configured
- [ ] GitHub secrets added (12 variables)
- [ ] Dockerfile.worker created
- [ ] GitHub Actions workflow enabled
- [ ] First push to main triggered deployment
- [ ] API health check passing
- [ ] Worker logs showing "ready"
- [ ] Video upload endpoint tested
- [ ] Monitoring dashboard created
- [ ] Backup strategy documented

---

**Next**: See `docs/DEPLOYMENT_PIPELINE.md` for detailed step-by-step instructions.
