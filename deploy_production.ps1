# Windows PowerShell Production Deployment Script for QuickAIShort.online
# Targets: quickaishort-api + quickaishort-worker on Cloud Run
$ErrorActionPreference = "Stop"

$PROJECT_ID = "quick-ai-shorts-477012"
$REGION = "us-central1"
$REPO_NAME = "quickaishort"
$DOCKER_REGISTRY = "us-central1-docker.pkg.dev"
$IMAGE_TAG = Get-Date -Format "yyyyMMdd-HHmmss"
$API_IMAGE_URI = "$DOCKER_REGISTRY/$PROJECT_ID/$REPO_NAME/api:$IMAGE_TAG"
$WORKER_IMAGE_URI = "$DOCKER_REGISTRY/$PROJECT_ID/$REPO_NAME/worker:$IMAGE_TAG"

Write-Output "Deploying QuickAIShort.online to Production [Tag: $IMAGE_TAG]..."

# 1. Build API image
Write-Output "Building API container image via Cloud Build..."
gcloud builds submit `
    --tag $API_IMAGE_URI `
    --project $PROJECT_ID `
    fastapi/

# 2. Build Worker image
Write-Output "Building Worker container image via Cloud Build..."
gcloud builds submit `
    --dockerfile fastapi/Dockerfile.worker `
    --tag $WORKER_IMAGE_URI `
    --project $PROJECT_ID `
    fastapi/

# 3. Deploy API to Cloud Run
Write-Output "Deploying quickaishort-api to Cloud Run..."
gcloud run deploy quickaishort-api `
    --image $API_IMAGE_URI `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --memory 4Gi `
    --cpu 2 `
    --concurrency 80 `
    --timeout 900 `
    --max-instances 3 `
    --project $PROJECT_ID `
    --update-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,PUBLIC_API_URL=https://quickaishort-api-946316698978.us-central1.run.app,WEB_CONCURRENCY=3,AUTH_DISABLED=false"

# 4. Deploy Celery Worker to Cloud Run
Write-Output "Deploying quickaishort-worker to Cloud Run..."
gcloud run deploy quickaishort-worker `
    --image $WORKER_IMAGE_URI `
    --region $REGION `
    --platform managed `
    --no-allow-unauthenticated `
    --memory 2Gi `
    --cpu 2 `
    --concurrency 1 `
    --timeout 600 `
    --max-instances 3 `
    --project $PROJECT_ID `
    --update-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,WEB_CONCURRENCY=1,AUTH_DISABLED=false"

Write-Output "Deployment complete."
$api_url = gcloud run services describe quickaishort-api --region $REGION --project $PROJECT_ID --format='value(status.url)'
Write-Output "API URL: $api_url"
