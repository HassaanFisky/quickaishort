#!/bin/bash
# Production Deployment Script for QuickAI Shorts
# Cost-policy locked (2026-07-21): do NOT raise API min-instances or worker CPU
# without an Engineering Decision + founder approval.
set -e
# On Windows/Git Bash, MSYS mangles Unix paths in --probe flags (e.g. /health → C:/Program Files/Git/health).
# Workaround: exclude the probe flag patterns from MSYS path conversion.
export MSYS2_ARG_CONV_EXCL="--liveness-probe=*:--startup-probe=*"

PROJECT_ID="quickaishort-agent-494304"
REGION="us-central1"
REPO_NAME="quickai-repo"
BUCKET_NAME="quickaishort-agent-494304-media"   # verified real bucket name
SA_EMAIL="99900313102-compute@developer.gserviceaccount.com"
IMAGE_TAG=$(date +%Y%m%d-%H%M%S)
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/backend:${IMAGE_TAG}"
PUBLIC_API_URL="https://quickai-api-y2cgnbsbxa-uc.a.run.app"

echo "Deploying QuickAI to Production [Tag: ${IMAGE_TAG}]..."

# 1. Build & Push
echo "Building Container Image..."
gcloud builds submit --tag ${IMAGE_URI} fastapi/ --project ${PROJECT_ID}

# 2. Deploy Web API — scale-to-zero + cpu-throttling (request-billed)
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
    --min-instances 0 \
    --cpu-throttling \
    "--liveness-probe=httpGet.path=/health,timeoutSeconds=5,failureThreshold=3,periodSeconds=30" \
    "--startup-probe=httpGet.path=/health,timeoutSeconds=10,failureThreshold=30,periodSeconds=10" \
    --project ${PROJECT_ID} \
    --update-env-vars \
ENVIRONMENT=production,\
GCS_BUCKET_NAME=${BUCKET_NAME},\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
PUBLIC_API_URL=${PUBLIC_API_URL},\
LOG_LEVEL=info,\
STUDIO_PROJECT_KERNEL=1

# 3. Deploy Render Worker — RQ listener must stay warm (min=1, no CPU throttling, cpu=1)
echo "Deploying Worker Service..."
gcloud run deploy quickai-worker \
    --image ${IMAGE_URI} \
    --region ${REGION} \
    --platform managed \
    --allow-unauthenticated \
    --ingress all \
    --service-account ${SA_EMAIL} \
    --command python \
    --args render_worker.py \
    --memory 4Gi \
    --cpu 1 \
    --concurrency 1 \
    --timeout 900 \
    --min-instances 1 \
    --no-cpu-throttling \
    --project ${PROJECT_ID} \
    --update-env-vars \
ENVIRONMENT=production,\
GCS_BUCKET_NAME=${BUCKET_NAME},\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
PUBLIC_API_URL=${PUBLIC_API_URL},\
LOG_LEVEL=info,\
STUDIO_PROJECT_KERNEL=1

echo "Deployment Complete."
API_URL=$(gcloud run services describe quickai-api --region ${REGION} --project ${PROJECT_ID} --format='value(status.url)')
echo "Web API URL: ${API_URL}"
