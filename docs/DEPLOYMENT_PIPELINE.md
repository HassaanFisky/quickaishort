# Video Processing Pipeline Deployment Guide

Complete production deployment guide for the FastAPI API server and Celery worker services on Google Cloud Run.

---

## Overview

The video processing pipeline consists of two services:

1. **FastAPI API Server** (`quickaishort-api`)
   - Handles video upload endpoints
   - Manages task polling and status queries
   - Serves as the main backend for the frontend
   - Handles authentication and request validation

2. **Celery Worker** (`quickaishort-worker`)
   - Processes async video rendering tasks
   - Applies FFmpeg filters (brightness, contrast, saturation, hue, blur)
   - Stores processed videos in MongoDB GridFS
   - Runs on-demand with Cloud Run

Both services communicate via Redis (broker) and MongoDB (persistent storage).

---

## Prerequisites

### Required Services
- **Google Cloud Project** with billing enabled
- **Redis Cloud** or **Memorystore for Redis** (production)
- **MongoDB Atlas** or **Firestore** (for GridFS storage)
- **Google Artifact Registry** (for Docker image hosting)
- **GitHub Actions** (for CI/CD)

### Local Tools
- `gcloud` CLI configured and authenticated
- `docker` CLI
- `git` for version control

### GitHub Secrets (Required)
Set these in your GitHub repository settings (Settings → Secrets → Actions):

```
GCP_WORKLOAD_IDENTITY_PROVIDER    # WIP for OIDC federation
GCP_SERVICE_ACCOUNT                # GCP service account email
REDIS_URL                          # redis://host:port/db (production)
MONGODB_URI                        # mongodb+srv://user:pass@host
GEMINI_API_KEY                     # Google Gemini API key
EXPORT_SIGNING_SECRET              # Random 32+ char string
NEXTAUTH_SECRET                    # Random 32+ char string
PUSHER_APP_ID                      # Pusher app ID (optional)
PUSHER_KEY                         # Pusher key (optional)
PUSHER_SECRET                      # Pusher secret (optional)
PUSHER_CLUSTER                     # Pusher cluster (optional)
```

---

## 1️⃣ Setup Google Cloud Project

### Step 1: Create GCP Service Account

```bash
PROJECT_ID="quick-ai-shorts-477012"
ACCOUNT_NAME="quickaishort-ci-cd"

# Create service account
gcloud iam service-accounts create ${ACCOUNT_NAME} \
  --project=${PROJECT_ID} \
  --display-name="CI/CD for QuickAI Short"

# Get the service account email
SA_EMAIL=$(gcloud iam service-accounts list --project=${PROJECT_ID} \
  --filter="displayName:${ACCOUNT_NAME}" \
  --format="value(email)")

echo "Service Account: ${SA_EMAIL}"
```

### Step 2: Grant Cloud Run Admin Permissions

```bash
# Cloud Run permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

# Artifact Registry permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer"

# Service Account permissions (for service-to-service auth)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"
```

### Step 3: Setup Workload Identity Federation (OIDC)

For GitHub Actions to authenticate without managing service account keys:

```bash
# Enable required APIs
gcloud services enable iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project=${PROJECT_ID}

# Create OIDC pool
gcloud iam workload-identity-pools create github-pool \
  --project=${PROJECT_ID} \
  --location=global \
  --display-name="GitHub Actions"

# Get pool resource name
POOL_NAME=$(gcloud iam workload-identity-pools describe github-pool \
  --project=${PROJECT_ID} \
  --location=global \
  --format="value(name)")

# Create OIDC provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project=${PROJECT_ID} \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,assertion.aud=assertion.aud,assertion.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-condition="assertion.repository_owner == 'HassaanFisky'"

# Bind GitHub to service account
gcloud iam service-accounts add-iam-policy-binding ${SA_EMAIL} \
  --project=${PROJECT_ID} \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/HassaanFisky/quickaishort"

# Get workload identity provider resource
WIP=$(gcloud iam workload-identity-pools providers describe github-provider \
  --project=${PROJECT_ID} \
  --location=global \
  --workload-identity-pool=github-pool \
  --format="value(name)")

echo "GCP_WORKLOAD_IDENTITY_PROVIDER=${WIP}"
echo "GCP_SERVICE_ACCOUNT=${SA_EMAIL}"
```

Store these as GitHub secrets.

### Step 4: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create quickaishort \
  --project=${PROJECT_ID} \
  --location=us-central1 \
  --repository-format=docker \
  --description="Docker images for QuickAI Short"
```

---

## 2️⃣ Setup Cloud Services

### Redis (for Celery broker)

**Option A: Redis Cloud** (recommended for production)
1. Go to https://app.redislabs.com
2. Create a free database or paid subscription
3. Get connection string: `redis://:<password>@<host>:<port>`

**Option B: Memorystore for Redis**
```bash
gcloud redis instances create quickaishort-redis \
  --size=1gb \
  --region=us-central1 \
  --redis-version=7.0 \
  --project=${PROJECT_ID}

# Get Redis host
REDIS_HOST=$(gcloud redis instances describe quickaishort-redis \
  --region=us-central1 \
  --project=${PROJECT_ID} \
  --format="value(host)")

REDIS_PORT=$(gcloud redis instances describe quickaishort-redis \
  --region=us-central1 \
  --project=${PROJECT_ID} \
  --format="value(port)")

echo "REDIS_URL=redis://${REDIS_HOST}:${REDIS_PORT}/0"
```

### MongoDB (for GridFS storage)

**Option A: MongoDB Atlas** (recommended)
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free cluster or paid deployment
3. Get connection string: `mongodb+srv://user:password@cluster.mongodb.net/database`

**Option B: Firestore**
```bash
gcloud firestore databases create --region=us-central1 --project=${PROJECT_ID}
```

---

## 3️⃣ Configure GitHub Secrets

Add these secrets to your GitHub repository:

```bash
# Run this script to add secrets
#!/bin/bash

gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER -b "$WIP"
gh secret set GCP_SERVICE_ACCOUNT -b "$SA_EMAIL"
gh secret set REDIS_URL -b "redis://:<password>@<host>:<port>"
gh secret set MONGODB_URI -b "mongodb+srv://user:pass@cluster.mongodb.net/db"
gh secret set GEMINI_API_KEY -b "AIzaSyA5cGTC937aTMVrWBBxlC5rGlkmNIM27YE"
gh secret set EXPORT_SIGNING_SECRET -b "$(openssl rand -base64 32)"
gh secret set NEXTAUTH_SECRET -b "$(openssl rand -base64 32)"
gh secret set PUSHER_APP_ID -b "optional"
gh secret set PUSHER_KEY -b "optional"
gh secret set PUSHER_SECRET -b "optional"
gh secret set PUSHER_CLUSTER -b "optional"
```

Or use GitHub CLI:
```bash
gh secret set REDIS_URL --body "redis://:<password>@<host>:<port>"
```

---

## 4️⃣ Deploy Services

### Automatic Deployment (via GitHub Actions)

Push to `main` branch to trigger deployment:

```bash
git add .
git commit -m "feat: production deployment"
git push origin main
```

The GitHub Actions workflow will:
1. ✅ Build FastAPI Docker image
2. ✅ Build Celery Worker Docker image
3. ✅ Run tests
4. ✅ Push to Artifact Registry
5. ✅ Deploy to Cloud Run
6. ✅ Verify health checks

### Manual Deployment (via CLI)

```bash
# Deploy FastAPI API
gcloud run deploy quickaishort-api \
  --source fastapi \
  --region=us-central1 \
  --allow-unauthenticated \
  --memory=4Gi \
  --cpu=2 \
  --timeout=900 \
  --max-instances=3 \
  --set-env-vars="WEB_CONCURRENCY=3" \
  --update-env-vars \
  REDIS_URL="$REDIS_URL",\
  MONGODB_URI="$MONGODB_URI",\
  GEMINI_API_KEY="$GEMINI_API_KEY",\
  EXPORT_SIGNING_SECRET="$EXPORT_SIGNING_SECRET",\
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET",\
  AUTH_DISABLED=false

# Deploy Celery Worker
gcloud run deploy quickaishort-worker \
  --source fastapi \
  --region=us-central1 \
  --no-allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=600 \
  --max-instances=3 \
  --set-env-vars="WEB_CONCURRENCY=1" \
  --update-env-vars \
  REDIS_URL="$REDIS_URL",\
  MONGODB_URI="$MONGODB_URI",\
  GEMINI_API_KEY="$GEMINI_API_KEY",\
  EXPORT_SIGNING_SECRET="$EXPORT_SIGNING_SECRET",\
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET",\
  AUTH_DISABLED=false \
  --args "celery,-A,workers.tasks,worker,--loglevel=info"
```

---

## 5️⃣ Verify Deployment

### Check Service Status

```bash
# API status
gcloud run services describe quickaishort-api \
  --region=us-central1 \
  --format='table(status.url, status.conditions[0].message)'

# Worker status
gcloud run services describe quickaishort-worker \
  --region=us-central1 \
  --format='table(status.url, status.conditions[0].message)'
```

### Test API Health

```bash
API_URL=$(gcloud run services describe quickaishort-api \
  --region=us-central1 \
  --format='value(status.url)')

curl -s "${API_URL}/health" | jq .
```

### View Logs

```bash
# Last 100 API logs
gcloud run logs read quickaishort-api \
  --region=us-central1 \
  --limit=100

# Last 50 Worker logs
gcloud run logs read quickaishort-worker \
  --region=us-central1 \
  --limit=50

# Real-time streaming
gcloud run logs read quickaishort-api \
  --region=us-central1 \
  --follow
```

### Test Video Upload Endpoint

```bash
# Create a test video file
ffmpeg -f lavfi -i testsrc=size=1280x720:duration=5 -pix_fmt yuv420p -y test.mp4

# Upload video
curl -X POST \
  -F "file=@test.mp4" \
  -F "process_video=false" \
  "${API_URL}/api/v1/video/upload"

# Expected response:
# {
#   "request_id": "...",
#   "file_id": "...",
#   "filename": "test.mp4",
#   "task_id": null,
#   "message": "Video uploaded successfully"
# }
```

---

## 6️⃣ Environment Variables Reference

| Variable | Purpose | Example |
|---|---|---|
| `REDIS_URL` | Celery broker connection | `redis://:password@host:6379/0` |
| `MONGODB_URI` | Database connection | `mongodb+srv://user:pass@cluster.mongodb.net` |
| `MONGODB_DB` | Database name | `quickaishort` |
| `GEMINI_API_KEY` | Google Gemini API | `AIzaSyA...` |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | `quick-ai-shorts-477012` |
| `EXPORT_SIGNING_SECRET` | Video signing key | Random 32+ char |
| `NEXTAUTH_SECRET` | NextAuth session key | Random 32+ char |
| `PUSHER_APP_ID` | Pusher notification ID | Optional |
| `PUSHER_KEY` | Pusher API key | Optional |
| `PUSHER_SECRET` | Pusher secret | Optional |
| `PUSHER_CLUSTER` | Pusher cluster | Optional |
| `AUTH_DISABLED` | Disable auth (dev only) | `false` |
| `WEB_CONCURRENCY` | Gunicorn workers | `3` (API), `1` (Worker) |

---

## 7️⃣ Scaling & Performance

### Auto-scaling Configuration

The Cloud Run services are configured for:

**API Server:**
- Min instances: 0 (cold start in ~5s)
- Max instances: 3
- CPU: 2 vCPU
- Memory: 4GB
- Concurrency: 80 requests per instance

**Celery Worker:**
- Min instances: 0 (on-demand)
- Max instances: 3
- CPU: 2 vCPU
- Memory: 2GB
- Concurrency: 1 (serial processing)

### Scaling Tuning

To increase worker throughput, adjust in Cloud Run:

```bash
# Allow 2 concurrent tasks per worker instance
gcloud run services update quickaishort-worker \
  --region=us-central1 \
  --max-instances=10 \
  --update-env-vars CELERY_WORKER_CONCURRENCY=2
```

---

## 8️⃣ Monitoring & Debugging

### Enable Cloud Monitoring

```bash
# Create uptime check for API
gcloud monitoring uptime-checks create \
  --display-name="QuickAI API Health" \
  --monitored-resource="uptime-url" \
  --http-check='{"path":"/health"}' \
  --selected-regions="USA,EUROPE"
```

### View Error Tracking

```bash
# Show recent errors
gcloud error-reporting list --limit=20
```

### Enable detailed logging

Update services to increase log verbosity:

```bash
gcloud run services update quickaishort-api \
  --region=us-central1 \
  --update-env-vars LOG_LEVEL=debug
```

---

## 9️⃣ Troubleshooting

### API failing to start

```bash
# Check logs
gcloud run logs read quickaishort-api --region=us-central1 --limit=50

# Common issues:
# - REDIS_URL not accessible (firewall, wrong URL)
# - MONGODB_URI not accessible (IP allowlist, wrong credentials)
# - GEMINI_API_KEY invalid
```

### Worker not processing tasks

```bash
# Check worker logs
gcloud run logs read quickaishort-worker --region=us-central1 --limit=50

# Verify Redis connection
redis-cli -u "$REDIS_URL" PING  # Should return PONG

# Check Celery queue
python -c "
from celery import Celery
from workers.tasks import process_video_render_task
app = Celery('quickaishort')
app.conf.broker_url = '$REDIS_URL'
print(app.control.inspect().active())
"
```

### Task timeout

If tasks are timing out:

1. Increase worker timeout in Dockerfile:
   ```dockerfile
   --time-limit=900  # 15 minutes instead of 10
   ```

2. Increase Cloud Run timeout:
   ```bash
   gcloud run services update quickaishort-worker \
     --region=us-central1 \
     --timeout=900
   ```

### Cold start latency

Cloud Run cold starts take ~5-10 seconds. To reduce:

1. Keep min-instances at 1 (costs money but faster response)
2. Warm up endpoints periodically with cron job
3. Pre-build container images locally

---

## 🔟 Disaster Recovery

### Backup & Restore

```bash
# Backup GridFS videos
mongodump --uri "$MONGODB_URI" --out ./backup

# Restore from backup
mongorestore --uri "$MONGODB_URI" ./backup

# List all uploads in GridFS
python -c "
from motor.motor_asyncio import AsyncClient
import asyncio

async def list_uploads():
    client = AsyncClient('$MONGODB_URI')
    db = client.quickaishort
    async for file in db.uploads.files.find():
        print(f\"{file['_id']}: {file['filename']}\")

asyncio.run(list_uploads())
"
```

### Rollback Deployment

```bash
# Revert to previous API deployment
gcloud run deploy quickaishort-api \
  --image gcr.io/$PROJECT_ID/quickaishort-api:previous-tag \
  --region=us-central1
```

---

## ✅ Deployment Checklist

- [ ] GCP project created and APIs enabled
- [ ] Service account created with proper permissions
- [ ] Workload Identity Federation configured
- [ ] Redis instance provisioned and accessible
- [ ] MongoDB Atlas configured with IP allowlist
- [ ] GitHub secrets added (all 12 variables)
- [ ] Dockerfile.worker created
- [ ] GitHub Actions workflow enabled
- [ ] First deployment triggered (check Actions tab)
- [ ] API health check passing
- [ ] Worker logs show "Worker is ready"
- [ ] Test video upload working
- [ ] Monitoring dashboards created
- [ ] Backup strategy documented

---

## Support & Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Celery Documentation](https://docs.celeryproject.org/)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Redis Documentation](https://redis.io/documentation)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
