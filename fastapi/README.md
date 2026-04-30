# QuickAIShort Google-Native Architecture

## Architecture Choices

- **Firestore:** Chosen as the primary NoSQL state store. Provides native real-time updates via snapshot listeners for frontend progress tracking, removing the need for WebSockets/Pusher.
- **Firebase Auth:** Handles identity seamlessly across client and server. Backend verifies tokens with `firebase-admin`, preventing spoofed UID injections.
- **Cloud Run Service (API):** Stateless entry point handling job creation, Pre-Flight orchestrations, and signed URL generation.
- **Cloud Run Jobs (Render):** Decouples the heavy FFmpeg compute from the API. Jobs run independently per video, scaling to zero and spinning up immediately without complex message queues (RQ/Redis removed).
- **Google Cloud Storage (GCS):** The central hub for all heavy assets. API never proxies bytes. Delivery is handled via time-limited V4 Signed URLs.
- **Vertex AI Gemini:** Used exclusively for reasoning (Director + 6 Personas).
- **Pre-Flight Aggregation:** A pure-Python deterministic calculator, avoiding LLM hallucinations for strict binary (RENDER/REVISE/REJECT) decisions.

## Environment Variables

Create a `.env` file in the `fastapi/` root:

```env
# Google Cloud Configuration
GCP_PROJECT_ID="your-project-id"
GCS_BUCKET_NAME="quickaishort-assets"

# Gemini Models
GEMINI_MODEL_FAST="gemini-2.5-flash"
GEMINI_MODEL_REASONING="gemini-2.5-pro"

# API Configuration
PORT=8000
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8000"

# Note: In production, ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid service account JSON
# or run natively on GCP services where default compute credentials apply.
```

## Local Run Instructions

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Start the API server:

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

3. To test a Cloud Run Job locally, set the `JOB_ID` and run the script:

   ```bash
   export JOB_ID="test-job-123"
   python -m app.jobs.render_job
   ```

## Deployment Commands (Google Cloud)

1. **Deploy API to Cloud Run Service:**

   ```bash
   gcloud run deploy quickaishort-api \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars="GCP_PROJECT_ID=your-project-id,GCS_BUCKET_NAME=quickaishort-assets"
   ```

2. **Deploy Render Engine to Cloud Run Jobs:**

   ```bash
   gcloud run jobs create quickaishort-render-job \
     --source . \
     --region us-central1 \
     --command="python" \
     --args="-m,app.jobs.render_job" \
     --set-env-vars="GCP_PROJECT_ID=your-project-id,GCS_BUCKET_NAME=quickaishort-assets"
   ```

## Final Acceptance Checklist

- [x] Input accepted (script/youtube)
- [x] Storyboard generated (Director Agent)
- [x] 6 Persona scores computed deterministically
- [x] Python-only Aggregator determines RENDER, REVISE, REJECT
- [x] Render isolated to Cloud Run Job (`render_job.py`)
- [x] Final MP4 uploaded to GCS
- [x] Time-limited Signed URL generated
- [x] Firebase Auth used natively
- [x] MongoDB / Redis / Pusher fully removed
