# Windows PowerShell Production Deployment Script for QuickAI Shorts
# Cost-policy locked (2026-07-21): do NOT raise API min-instances or worker CPU
# without an Engineering Decision + founder approval.
$ErrorActionPreference = "Stop"

$PROJECT_ID = "quickaishort-agent-494304"
$REGION = "us-central1"
$REPO_NAME = "quickai-repo"
$BUCKET_NAME = "quickaishort-agent-494304-media"   # verified real bucket name
$SA_EMAIL = "99900313102-compute@developer.gserviceaccount.com"
$TASKS_QUEUE = "quickai-render"
$IMAGE_TAG = Get-Date -Format "yyyyMMdd-HHmmss"
$IMAGE_URI = "$($REGION)-docker.pkg.dev/$($PROJECT_ID)/$($REPO_NAME)/backend:$($IMAGE_TAG)"
$PUBLIC_API_URL = "https://quickai-api-y2cgnbsbxa-uc.a.run.app"

Write-Output "Deploying QuickAI to Production (Windows Native) [Tag: $IMAGE_TAG]..."

# 1. Build & Push
Write-Output "Building Container Image using Cloud Build..."
gcloud builds submit --tag $IMAGE_URI fastapi/ --project $PROJECT_ID

# 2. Ensure the durable wake path and its least-privilege identities exist.
Write-Output "Configuring Cloud Tasks queue and IAM..."
gcloud services enable cloudtasks.googleapis.com --project $PROJECT_ID
gcloud tasks queues describe $TASKS_QUEUE --location $REGION --project $PROJECT_ID *> $null
if ($LASTEXITCODE -ne 0) {
    gcloud tasks queues create $TASKS_QUEUE --location $REGION --project $PROJECT_ID
}
gcloud tasks queues update $TASKS_QUEUE `
    --location $REGION `
    --max-dispatches-per-second 2 `
    --max-concurrent-dispatches 3 `
    --max-attempts 3 `
    --max-retry-duration 3600s `
    --min-backoff 30s `
    --max-backoff 120s `
    --max-doublings 2 `
    --log-sampling-ratio 1.0 `
    --project $PROJECT_ID
gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member "serviceAccount:$SA_EMAIL" `
    --role roles/cloudtasks.enqueuer `
    --condition None
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL `
    --member "serviceAccount:$SA_EMAIL" `
    --role roles/iam.serviceAccountUser `
    --project $PROJECT_ID

# 3. Deploy private request-bound renderer — Cloud Tasks wakes it from zero.
Write-Output "Deploying request-bound renderer to Cloud Run..."
gcloud run deploy quickai-worker `
    --image $IMAGE_URI `
    --region $REGION `
    --platform managed `
    --no-allow-unauthenticated `
    --invoker-iam-check `
    --ingress all `
    --service-account $SA_EMAIL `
    --command uvicorn `
    '--args=render_service_app:app,--host,0.0.0.0,--port,8080' `
    --memory 4Gi `
    --cpu 1 `
    --concurrency 1 `
    --timeout 900 `
    --min-instances 0 `
    --max-instances 3 `
    --cpu-throttling `
    --project $PROJECT_ID `
    --update-env-vars "ENVIRONMENT=production,GCS_BUCKET_NAME=$BUCKET_NAME,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,PUBLIC_API_URL=$PUBLIC_API_URL,LOG_LEVEL=info,STUDIO_PROJECT_KERNEL=1,RENDER_DISPATCH_MODE=cloud_tasks,CLOUD_TASKS_MAX_ATTEMPTS=3"
gcloud run services add-iam-policy-binding quickai-worker `
    --region $REGION `
    --member "serviceAccount:$SA_EMAIL" `
    --role roles/run.invoker `
    --project $PROJECT_ID

$RENDER_URL = gcloud run services describe quickai-worker --region $REGION --project $PROJECT_ID --format='value(status.url)'

# 4. Switch the public API to durable Cloud Tasks dispatch.
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
    --update-env-vars "ENVIRONMENT=production,GCS_BUCKET_NAME=$BUCKET_NAME,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,PUBLIC_API_URL=$PUBLIC_API_URL,LOG_LEVEL=info,STUDIO_PROJECT_KERNEL=1,RENDER_DISPATCH_MODE=cloud_tasks,CLOUD_TASKS_LOCATION=$REGION,CLOUD_TASKS_QUEUE=$TASKS_QUEUE,CLOUD_TASKS_RENDER_URL=$RENDER_URL,CLOUD_TASKS_OIDC_AUDIENCE=$RENDER_URL,CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT=$SA_EMAIL,CLOUD_TASKS_DISPATCH_DEADLINE_SECONDS=900"

Write-Output "Deployment Complete."
$api_url = gcloud run services describe quickai-api --region $REGION --project $PROJECT_ID --format='value(status.url)'
Write-Output "Web API URL: $api_url"
Write-Output "Private renderer URL: $RENDER_URL"
