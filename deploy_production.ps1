# Windows PowerShell Production Deployment Script for QuickAI Shorts
$ErrorActionPreference = "Stop"

$PROJECT_ID = "quickaishort-agent-494304"
$REGION = "us-central1"
$REPO_NAME = "quickai-repo"
$BUCKET_NAME = "quickaishort-agent-494304-media"   # verified real bucket name
$SA_EMAIL = "99900313102-compute@developer.gserviceaccount.com"
$IMAGE_TAG = Get-Date -Format "yyyyMMdd-HHmmss"
$IMAGE_URI = "$($REGION)-docker.pkg.dev/$($PROJECT_ID)/$($REPO_NAME)/backend:$($IMAGE_TAG)"

Write-Output "Deploying QuickAI to Production (Windows Native) [Tag: $IMAGE_TAG]..."

# 1. Build & Push
Write-Output "Building Container Image using Cloud Build..."
gcloud builds submit --tag $IMAGE_URI fastapi/ --project $PROJECT_ID

# 2. Deploy Web API
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
    --min-instances 1 `
    --project $PROJECT_ID `
    --update-env-vars "ENVIRONMENT=production,GCS_BUCKET_NAME=$BUCKET_NAME,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,PUBLIC_API_URL=https://quickai-api-y2cgnbsbxa-uc.a.run.app,LOG_LEVEL=info"

# 3. Deploy Render Worker (RQ must stay warm — never min-instances=0)
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
    --cpu 2 `
    --concurrency 1 `
    --timeout 900 `
    --min-instances 1 `
    --no-cpu-throttling `
    --project $PROJECT_ID `
    --update-env-vars "ENVIRONMENT=production,GCS_BUCKET_NAME=$BUCKET_NAME,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,PUBLIC_API_URL=https://quickai-api-y2cgnbsbxa-uc.a.run.app,LOG_LEVEL=info,STUDIO_PROJECT_KERNEL=1"

Write-Output "Deployment Complete."
$api_url = gcloud run services describe quickai-api --region $REGION --project $PROJECT_ID --format='value(status.url)'
Write-Output "Web API URL: $api_url"
