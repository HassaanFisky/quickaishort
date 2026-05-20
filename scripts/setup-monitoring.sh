#!/bin/bash
# setup-monitoring.sh - Configure Prometheus and Grafana for QuickAI monitoring

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

PROJECT_ID="${1:-quick-ai-shorts-477012}"
REGION="${2:-us-central1}"

info "Setting up monitoring for QuickAI Short (project: $PROJECT_ID, region: $REGION)"
echo ""

# ────────────────────────────────────────────────────────────────────────────
# 1. Setup Prometheus in Cloud Run
# ────────────────────────────────────────────────────────────────────────────

echo "========================================================================"
echo "1. Prometheus Setup"
echo "========================================================================"
echo ""

info "Creating Prometheus configuration..."

cat > /tmp/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'quickaishort-api'
    scheme: https
    static_configs:
      - targets: ['quickaishort-api-quick-ai-shorts-477012.run.app']
    metrics_path: '/metrics'

  - job_name: 'quickaishort-worker'
    scheme: https
    static_configs:
      - targets: ['quickaishort-worker-quick-ai-shorts-477012.run.app']
    metrics_path: '/metrics'

alerting:
  alertmanagers:
    - static_configs:
        - targets: []

rule_files: []
EOF

success "Prometheus config created: /tmp/prometheus.yml"
echo ""

# ────────────────────────────────────────────────────────────────────────────
# 2. Setup Cloud Monitoring Alerts
# ────────────────────────────────────────────────────────────────────────────

echo "========================================================================"
echo "2. Cloud Monitoring Alerts"
echo "========================================================================"
echo ""

info "Creating uptime check for API health..."
gcloud monitoring uptime-checks create \
  --display-name="QuickAI API Health" \
  --monitored-resource="uptime-url" \
  --http-check='{"port":"443","path":"/health","use_ssl":true}' \
  --selected-regions="USA,EUROPE,ASIA_PACIFIC" \
  --project="$PROJECT_ID" 2>/dev/null || warn "Uptime check may already exist"

success "Uptime check configured"
echo ""

info "Creating alert policy for high error rate..."
cat > /tmp/alert_policy.json << 'EOF'
{
  "displayName": "QuickAI FFmpeg Error Rate High",
  "conditions": [
    {
      "displayName": "FFmpeg errors > 5 per minute",
      "conditionThreshold": {
        "filter": "metric.type=\"custom.googleapis.com/ffmpeg_errors_total\" AND resource.type=\"cloud_run_revision\"",
        "comparison": "COMPARISON_GT",
        "thresholdValue": 5,
        "duration": "300s"
      }
    }
  ],
  "notificationChannels": []
}
EOF

success "Alert policy template created: /tmp/alert_policy.json"
echo ""

# ────────────────────────────────────────────────────────────────────────────
# 3. Local Development Setup
# ────────────────────────────────────────────────────────────────────────────

echo "========================================================================"
echo "3. Local Development Monitoring"
echo "========================================================================"
echo ""

if command -v docker &> /dev/null; then
  info "Docker found. Creating docker-compose.yml for local Prometheus + Grafana..."

  cat > docker-compose.monitoring.yml << 'EOF'
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.local.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_SECURITY_ADMIN_USER=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
EOF

  success "docker-compose.monitoring.yml created"
  echo ""

  info "Creating local Prometheus config..."
  cat > prometheus.local.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'fastapi-local'
    scheme: http
    static_configs:
      - targets: ['host.docker.internal:8000']
    metrics_path: '/metrics'
EOF

  success "prometheus.local.yml created"
  echo ""

  echo "Start monitoring stack:"
  echo "  docker-compose -f docker-compose.monitoring.yml up"
  echo ""
  echo "Access:"
  echo "  Prometheus: http://localhost:9090"
  echo "  Grafana:    http://localhost:3000 (admin:admin)"
else
  warn "Docker not found. Install Docker to use local monitoring stack."
fi

echo ""

# ────────────────────────────────────────────────────────────────────────────
# 4. Sentry Setup
# ────────────────────────────────────────────────────────────────────────────

echo "========================================================================"
echo "4. Sentry Configuration"
echo "========================================================================"
echo ""

read -p "Do you have a Sentry DSN? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  read -p "Enter Sentry DSN: " SENTRY_DSN

  info "Setting SENTRY_DSN in Cloud Run..."
  gcloud run services update quickaishort-api \
    --update-env-vars SENTRY_DSN="$SENTRY_DSN" \
    --region="$REGION" \
    --project="$PROJECT_ID"

  gcloud run services update quickaishort-worker \
    --update-env-vars SENTRY_DSN="$SENTRY_DSN" \
    --region="$REGION" \
    --project="$PROJECT_ID"

  success "Sentry DSN configured for both services"
else
  warn "Sentry DSN not configured. Skip for now."
  echo ""
  echo "To enable error tracking later:"
  echo "  1. Create account at https://sentry.io"
  echo "  2. Create project for Python/Celery"
  echo "  3. Copy DSN and run: gh secret set SENTRY_DSN -b \"<DSN>\""
  echo "  4. Push to main to redeploy"
fi

echo ""

# ────────────────────────────────────────────────────────────────────────────
# 5. Verify Metrics Endpoint
# ────────────────────────────────────────────────────────────────────────────

echo "========================================================================"
echo "5. Verification"
echo "========================================================================"
echo ""

info "Testing metrics endpoint (this may take 30s)..."
API_URL=$(gcloud run services describe quickaishort-api \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)' 2>/dev/null)

if [ -z "$API_URL" ]; then
  warn "Could not get API URL. Make sure services are deployed."
else
  sleep 10
  if curl -sf "$API_URL/metrics" > /dev/null 2>&1; then
    success "Metrics endpoint is accessible"
    echo "   URL: $API_URL/metrics"
  else
    warn "Metrics endpoint not yet responding (service may still be starting)"
  fi
fi

echo ""

# ────────────────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────────────────

echo "========================================================================"
echo "Monitoring Setup Complete"
echo "========================================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. LOCAL DEVELOPMENT:"
echo "   docker-compose -f docker-compose.monitoring.yml up"
echo "   Then visit: http://localhost:9090 (Prometheus) or http://localhost:3000 (Grafana)"
echo ""
echo "2. PRODUCTION METRICS:"
echo "   curl https://quickaishort-api-xxx.run.app/metrics"
echo ""
echo "3. SENTRY ERRORS:"
echo "   Visit https://sentry.io and create a Python/Celery project"
echo ""
echo "4. DOCUMENTATION:"
echo "   See docs/OBSERVABILITY.md for detailed setup and dashboards"
echo ""
