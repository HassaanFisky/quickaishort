#!/usr/bin/env bash
# deploy.sh — Full deployment for QuickAIShort.online
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - vercel CLI installed (npm i -g vercel) and authenticated (vercel login)
#   - fastapi/.env file filled in (copy from fastapi/.env.example)
#   - frontend/.env.local file filled in (copy from frontend/.env.example)

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REGION="us-central1"
BACKEND_SERVICE="quickaishort-api"
WORKER_SERVICE="quickaishort-worker"

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
info "Checking prerequisites..."

command -v gcloud   >/dev/null 2>&1 || error "gcloud not installed. See: https://cloud.google.com/sdk/docs/install"
command -v vercel   >/dev/null 2>&1 || error "vercel not installed. Run: npm i -g vercel"
command -v python3  >/dev/null 2>&1 || error "python3 not found"
command -v node     >/dev/null 2>&1 || error "node not found"

[[ -f "fastapi/.env" ]] || error "fastapi/.env not found. Copy fastapi/.env.example and fill in values."
[[ -f "frontend/.env.local" ]] || error "frontend/.env.local not found. Copy frontend/.env.example and fill in values."

# Load backend env for validation
set -o allexport
source fastapi/.env
set +o allexport

# Validate required backend vars
REQUIRED_BACKEND=(NEXTAUTH_SECRET MONGODB_URI REDIS_URL GEMINI_API_KEY EXPORT_SIGNING_SECRET PUBLIC_API_URL PUSHER_APP_ID PUSHER_KEY PUSHER_SECRET)
for var in "${REQUIRED_BACKEND[@]}"; do
  [[ -n "${!var:-}" ]] || error "fastapi/.env is missing required variable: $var"
done
[[ "${AUTH_DISABLED:-false}" == "false" ]] || warn "AUTH_DISABLED=true — auth is bypassed. Set to false for production."
[[ "${#NEXTAUTH_SECRET}" -ge 32 ]] || error "NEXTAUTH_SECRET is too short (min 32 chars). Regenerate with: openssl rand -base64 32"

info "All required env vars present."

# ── Step 1: Local build verification ─────────────────────────────────────────
info "Step 1/4: Verifying local Python imports..."
cd fastapi
AUTH_DISABLED=true NEXTAUTH_SECRET=validate python3 -c "import main; print('  Python import: OK')"
cd ..

info "Step 1/4: Verifying frontend build..."
cd frontend
npm ci --quiet
npx tsc --noEmit
NEXT_PUBLIC_API_URL="${PUBLIC_API_URL}" \
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}" \
NEXTAUTH_URL="https://quickaishort.online" \
npm run build --quiet
cd ..
info "Local build checks passed."

# ── Step 2: Deploy backend to Cloud Run ───────────────────────────────────────
info "Step 2/4: Deploying backend to Cloud Run (region: ${REGION})..."

# Build env-vars string from .env file (exclude comments and blanks)
ENV_VARS=$(grep -v '^\s*#' fastapi/.env | grep -v '^\s*$' | grep '=' | \
  while IFS= read -r line; do
    key="${line%%=*}"
    val="${line#*=}"
    # Skip empty values and keys with spaces
    [[ -z "$val" ]] && continue
    [[ "$key" =~ [[:space:]] ]] && continue
    printf '%s=%s,' "$key" "$val"
  done | sed 's/,$//')

gcloud run deploy "${BACKEND_SERVICE}" \
  --source fastapi \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 3 \
  --set-env-vars "${ENV_VARS}" \
  --quiet

BACKEND_URL=$(gcloud run services describe "${BACKEND_SERVICE}" \
  --region "${REGION}" \
  --format "value(status.url)")

info "Backend deployed: ${BACKEND_URL}"

# ── Step 3: Verify backend health ─────────────────────────────────────────────
info "Step 3/4: Checking backend health..."
sleep 5  # allow cold start

HEALTH=$(curl -sf "${BACKEND_URL}/health" 2>/dev/null || echo '{"status":"unreachable"}')
echo "  /health response: ${HEALTH}"

if echo "${HEALTH}" | grep -q '"status":"ok"'; then
  info "Backend health: OK"
else
  warn "Backend health check returned unexpected response. Check logs:"
  warn "  gcloud run logs read --service ${BACKEND_SERVICE} --region ${REGION} --limit 50"
fi

if echo "${HEALTH}" | grep -q '"adk":false'; then
  warn "ADK is unavailable on this instance — check GEMINI_API_KEY and google-adk install."
fi

if echo "${HEALTH}" | grep -q '"mongo":false'; then
  warn "MongoDB is not connected — check MONGODB_URI."
fi

# ── Step 4: Deploy worker ─────────────────────────────────────────────────────
info "Step 4/4: Deploying render worker..."

# Worker uses the same image but a different command via a Job
# We create/update a Cloud Run Job for the worker process
gcloud run jobs update "${WORKER_SERVICE}" \
  --image "$(gcloud run services describe ${BACKEND_SERVICE} --region ${REGION} --format 'value(spec.template.spec.template.spec.containers[0].image)')" \
  --region "${REGION}" \
  --task-timeout 600 \
  --set-env-vars "${ENV_VARS}" \
  --command "python3" \
  --args "render_worker.py" \
  --quiet 2>/dev/null || \
gcloud run jobs create "${WORKER_SERVICE}" \
  --image "$(gcloud run services describe ${BACKEND_SERVICE} --region ${REGION} --format 'value(spec.template.spec.template.spec.containers[0].image)')" \
  --region "${REGION}" \
  --task-timeout 600 \
  --set-env-vars "${ENV_VARS}" \
  --command "python3" \
  --args "render_worker.py" \
  --quiet

info "Worker job created. To run it continuously:"
info "  gcloud run jobs execute ${WORKER_SERVICE} --region ${REGION}"
warn "NOTE: Cloud Run Jobs are not persistent. For a persistent worker use a VM or Cloud Run Service with --command python3 render_worker.py"

# ── Step 5: Deploy frontend to Vercel ─────────────────────────────────────────
info "Step 5/4: Deploying frontend to Vercel..."
cd frontend

# Set Vercel environment variables from .env.local
while IFS= read -r line; do
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  [[ -z "$val" ]] && continue
  echo "${val}" | vercel env add "${key}" production --force >/dev/null 2>&1 || true
done < .env.local

# Override with the actual backend URL
echo "${BACKEND_URL}" | vercel env add NEXT_PUBLIC_API_URL production --force >/dev/null 2>&1 || true

vercel --prod --yes

cd ..

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment complete${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo "  Backend:  ${BACKEND_URL}"
echo "  Worker:   gcloud run jobs execute ${WORKER_SERVICE} --region ${REGION}"
echo ""
echo "  Verify end-to-end:"
echo "    curl ${BACKEND_URL}/health"
echo "    curl -X POST ${BACKEND_URL}/api/analyze -H 'Authorization: Bearer \$TOKEN' -H 'Content-Type: application/json' -d '{\"videoId\":\"dQw4w9WgXcQ\",\"transcript\":[{\"text\":\"test\",\"start\":0,\"end\":5}],\"duration\":5,\"userId\":\"test\"}'"
