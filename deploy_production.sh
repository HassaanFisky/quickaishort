#!/bin/bash
# Production Deployment Script for QuickAI Shorts
set -e
# On Windows/Git Bash, MSYS mangles Unix paths in --probe flags (e.g. /health → C:/Program Files/Git/health).
# Workaround: exclude the probe flag patterns from MSYS path conversion.
export MSYS2_ARG_CONV_EXCL="--liveness-probe=*:--startup-probe=*"

PROJECT_ID="quickaishort-agent-494304"
REGION="us-central1"
REPO_NAME="quickai-repo"
BUCKET_NAME="qai-exports-${PROJECT_ID}"
SA_EMAIL="99900313102-compute@developer.gserviceaccount.com"
IMAGE_TAG=$(date +%Y%m%d-%H%M%S)
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/backend:${IMAGE_TAG}"

echo "🚀 Deploying QuickAI to Production [Tag: ${IMAGE_TAG}]..."

# 1. Build & Push
echo "Building Container Image..."
# Ensure we build from the fastapi directory where the Dockerfile lives
gcloud builds submit --tag ${IMAGE_URI} fastapi/ --project ${PROJECT_ID}

# 2. Deploy Web API
echo "Deploying Web Service..."
gcloud run deploy quickai-api \
    --image ${IMAGE_URI} \
    --region ${REGION} \
    --platform managed \
    --allow-unauthenticated \
    --service-account ${SA_EMAIL} \
    --memory 2Gi \
    --cpu 2 \
    --concurrency 80 \
    --timeout 300 \
    --min-instances 1 \
    "--liveness-probe=httpGet.path=/health,timeoutSeconds=5,failureThreshold=3,periodSeconds=30" \
    "--startup-probe=httpGet.path=/health,timeoutSeconds=10,failureThreshold=30,periodSeconds=10" \
    --project ${PROJECT_ID} \
    --update-env-vars \
ENVIRONMENT=production,\
WEB_CONCURRENCY=2,\
GCS_BUCKET_NAME=${BUCKET_NAME},\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
PUBLIC_API_URL=https://quickai-api-y2cgnbsbxa-uc.a.run.app,\
LOG_LEVEL=INFO

# 3. Deploy Render Worker
echo "Deploying Worker Service..."
gcloud run deploy quickai-worker \
    --image ${IMAGE_URI} \
    --region ${REGION} \
    --platform managed \
    --no-allow-unauthenticated \
    --service-account ${SA_EMAIL} \
    --command python \
    --args render_worker.py \
    --memory 8Gi \
    --cpu 4 \
    --concurrency 1 \
    --timeout 900 \
    --min-instances 0 \
    --project ${PROJECT_ID} \
    --update-env-vars \
ENVIRONMENT=production,\
GCS_BUCKET_NAME=${BUCKET_NAME},\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
PUBLIC_API_URL=https://quickai-api-y2cgnbsbxa-uc.a.run.app,\
LOG_LEVEL=INFO

echo "✅ Deployment Complete."
echo "Web API: $(gcloud run services describe quickai-api --region ${REGION} --project ${PROJECT_ID} --format='value(status.url)')"
