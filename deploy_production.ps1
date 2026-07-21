# Windows PowerShell Production Deployment Script for QuickAI Shorts
# Cost-policy locked (2026-07-21): do NOT raise API min-instances or worker CPU
# without an Engineering Decision + founder approval.
$ErrorActionPreference = "Stop"

$PROJECT_ID = "quickaishort-agent-494304"
$REGION = "us-central1"
$REPO_NAME = "quickai-repo"
$BUCKET_NAME = "quickaishort-agent-494304-media"   # verified real bucket name
$SA_EMAIL = "99900313102-compute@developer.gserviceaccount.com"
$IMAGE_TAG = Get-Date -Format "yyyyMMdd-HHmmss"
$IMAGE_URI = "$($REGION)-docker.pkg.dev/$($PROJECT_ID)/$($REPO_NAME)/backend:$($IMAGE_TAG)"
$PUBLIC_API_URL = "https://quickai-api-y2cgnbsbxa-uc.a.run.app"

Write-Output "Deploying QuickAI to Production (Windows Native) [Tag: $IMAGE_TAG]..."

# 1. Build & Push
Write-Output "Building Container Image using Cloud Build..."
gcloud builds submit --tag $IMAGE_URI fastapi/ --project $PROJECT_ID

# 2. Deploy Web API — scale-to-zero + cpu-throttling (request-billed)
Write-Output "Deploying Web Service to Cloud Run..."
gcloud run deploy quickai-api `
    --image $IMAGE_URI `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --service-account $SA_EMAIL `
    --memory 2Gi `
    --cpu 2 `
    --concurrency 80 `
    --timeout 300 `
    --min-instances 0 `
    --cpu-throttling `
    --project $PROJECT_ID `
    --update-env-vars "ENVIRONMENT=production,GCS_BUCKET_NAME=$BUCKET_NAME,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,PUBLIC_API_URL=$PUBLIC_API_URL,LOG_LEVEL=info,STUDIO_PROJECT_KERNEL=1"

# 3. Deploy Render Worker — RQ listener must stay warm (min=1, no CPU throttling)
# Idle cost reduced via cpu=1 (not 2). Never set min-instances=0 without a wake path.
Write-Output "Deploying Worker Service to Cloud Run..."
gcloud run deploy quickai-worker `
    --image $IMAGE_URI `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --ingress all `
    --service-account $SA_EMAIL `
    --command python `
    --args render_worker.py `
    --memory 4Gi `
    --cpu 1 `
    --concurrency 1 `
    --timeout 900 `
    --min-instances 1 `
    --no-cpu-throttling `
    --project $PROJECT_ID `
    --update-env-vars "ENVIRONMENT=production,GCS_BUCKET_NAME=$BUCKET_NAME,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,PUBLIC_API_URL=$PUBLIC_API_URL,LOG_LEVEL=info,STUDIO_PROJECT_KERNEL=1"

Write-Output "Deployment Complete."
$api_url = gcloud run services describe quickai-api --region $REGION --project $PROJECT_ID --format='value(status.url)'
Write-Output "Web API URL: $api_url"
