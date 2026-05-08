#!/bin/bash
# Production Deployment Script for QuickAI Shorts
set -e

PROJECT_ID="quickaishort-agent-494304"
REGION="us-central1"
REPO_NAME="quickai-repo"
BUCKET_NAME="qai-exports-${PROJECT_ID}"
SA_EMAIL="quickai-sa@${PROJECT_ID}.iam.gserviceaccount.com"
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
    --liveness-probe-path=/health/live \
    --readiness-probe-path=/health/ready \
    --project ${PROJECT_ID} \
    --update-env-vars \
ENVIRONMENT=production,\
GCS_BUCKET_NAME=${BUCKET_NAME},\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
PUBLIC_API_URL=https://quickai-api-y2cgnbsbxa-uc.a.run.app,\
LOG_LEVEL=info

# 3. Deploy Render Worker
echo "Deploying Worker Service..."
gcloud run deploy quickai-worker \
    --image ${IMAGE_URI} \
    --region ${REGION} \
    --platform managed \
    --no-allow-unauthenticated \
    --service-account ${SA_EMAIL} \
    --command python,render_worker.py \
    --memory 8Gi \
    --cpu 4 \
    --concurrency 1 \
    --timeout 900 \
    --project ${PROJECT_ID} \
    --update-env-vars \
ENVIRONMENT=production,\
GCS_BUCKET_NAME=${BUCKET_NAME},\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
PUBLIC_API_URL=https://quickai-api-y2cgnbsbxa-uc.a.run.app,\
LOG_LEVEL=info

echo "✅ Deployment Complete."
echo "Web API: $(gcloud run services describe quickai-api --region ${REGION} --project ${PROJECT_ID} --format='value(status.url)')"
