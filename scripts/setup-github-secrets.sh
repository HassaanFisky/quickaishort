#!/usr/bin/env bash
# setup-github-secrets.sh
# Configures GitHub repository secrets for deployment pipeline
#
# Usage:
#   chmod +x scripts/setup-github-secrets.sh
#   ./scripts/setup-github-secrets.sh

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

# ────────────────────────────────────────────────────────────────────────────
# Prerequisites
# ────────────────────────────────────────────────────────────────────────────

info "Checking prerequisites..."

command -v gh >/dev/null 2>&1 || error "GitHub CLI (gh) not installed. See: https://cli.github.com"
command -v openssl >/dev/null 2>&1 || error "openssl not installed"

# Check GitHub CLI auth
gh auth status >/dev/null 2>&1 || error "GitHub CLI not authenticated. Run: gh auth login"

success "Prerequisites OK"

# ────────────────────────────────────────────────────────────────────────────
# Get Repository
# ────────────────────────────────────────────────────────────────────────────

REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
echo ""
info "Configuring secrets for repository: ${BLUE}${REPO}${NC}"
echo ""

# ────────────────────────────────────────────────────────────────────────────
# Required Secrets
# ────────────────────────────────────────────────────────────────────────────

echo "======================================================================"
echo "GitHub Secrets Configuration"
echo "======================================================================"
echo ""

declare -A SECRETS

# GCP Configuration
echo -e "${YELLOW}1. Google Cloud Project (GCP) Configuration${NC}"
echo ""

read -p "  GCP Project ID (e.g., quick-ai-shorts-477012): " GCP_PROJECT_ID
[[ -z "$GCP_PROJECT_ID" ]] && error "GCP Project ID required"
SECRETS["GCP_PROJECT_ID"]="$GCP_PROJECT_ID"

read -p "  GCP Service Account Email: " GCP_SERVICE_ACCOUNT
[[ -z "$GCP_SERVICE_ACCOUNT" ]] && error "Service account email required"
SECRETS["GCP_SERVICE_ACCOUNT"]="$GCP_SERVICE_ACCOUNT"

read -p "  GCP Workload Identity Provider (full resource name): " GCP_WORKLOAD_IDENTITY_PROVIDER
[[ -z "$GCP_WORKLOAD_IDENTITY_PROVIDER" ]] && error "Workload Identity Provider required"
SECRETS["GCP_WORKLOAD_IDENTITY_PROVIDER"]="$GCP_WORKLOAD_IDENTITY_PROVIDER"

echo ""
echo -e "${YELLOW}2. Redis Configuration${NC}"
echo ""

read -p "  Redis URL (e.g., redis://:password@host:6379/0): " REDIS_URL
[[ -z "$REDIS_URL" ]] && error "Redis URL required"
SECRETS["REDIS_URL"]="$REDIS_URL"

echo ""
echo -e "${YELLOW}3. MongoDB Configuration${NC}"
echo ""

read -p "  MongoDB URI (mongodb+srv://...): " MONGODB_URI
[[ -z "$MONGODB_URI" ]] && error "MongoDB URI required"
SECRETS["MONGODB_URI"]="$MONGODB_URI"

echo ""
echo -e "${YELLOW}4. API Keys${NC}"
echo ""

read -p "  Gemini API Key: " GEMINI_API_KEY
[[ -z "$GEMINI_API_KEY" ]] && error "Gemini API Key required"
SECRETS["GEMINI_API_KEY"]="$GEMINI_API_KEY"

echo ""
echo -e "${YELLOW}5. Secrets (auto-generated)${NC}"
echo ""

EXPORT_SIGNING_SECRET=$(openssl rand -base64 32)
echo "  ✓ EXPORT_SIGNING_SECRET: ${EXPORT_SIGNING_SECRET:0:20}..."
SECRETS["EXPORT_SIGNING_SECRET"]="$EXPORT_SIGNING_SECRET"

NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "  ✓ NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:0:20}..."
SECRETS["NEXTAUTH_SECRET"]="$NEXTAUTH_SECRET"

echo ""
echo -e "${YELLOW}6. Pusher Configuration (optional)${NC}"
echo ""

read -p "  Pusher App ID (or leave blank): " PUSHER_APP_ID
[[ -n "$PUSHER_APP_ID" ]] && SECRETS["PUSHER_APP_ID"]="$PUSHER_APP_ID" || warn "Pusher skipped"

if [[ -n "$PUSHER_APP_ID" ]]; then
  read -p "  Pusher Key: " PUSHER_KEY
  SECRETS["PUSHER_KEY"]="$PUSHER_KEY"

  read -p "  Pusher Secret: " PUSHER_SECRET
  SECRETS["PUSHER_SECRET"]="$PUSHER_SECRET"

  read -p "  Pusher Cluster: " PUSHER_CLUSTER
  SECRETS["PUSHER_CLUSTER"]="$PUSHER_CLUSTER"
fi

# ────────────────────────────────────────────────────────────────────────────
# Summary & Confirmation
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "======================================================================"
echo "Secrets Summary"
echo "======================================================================"
echo ""

for key in "${!SECRETS[@]}"; do
  value="${SECRETS[$key]}"
  if [[ ${#value} -gt 30 ]]; then
    display="${value:0:20}...${value: -10}"
  else
    display="$value"
  fi
  echo "  $key = $display"
done

echo ""
read -p "Continue with these secrets? (y/N): " -n 1 -r
echo
[[ $REPLY =~ ^[Yy]$ ]] || { warn "Cancelled"; exit 0; }

# ────────────────────────────────────────────────────────────────────────────
# Set Secrets
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "======================================================================"
echo "Setting GitHub Secrets"
echo "======================================================================"
echo ""

for key in "${!SECRETS[@]}"; do
  value="${SECRETS[$key]}"
  gh secret set "$key" --body "$value"
  success "Secret ${GREEN}${key}${NC} set"
done

# ────────────────────────────────────────────────────────────────────────────
# Verify
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "======================================================================"
echo "Verification"
echo "======================================================================"
echo ""

info "Listing configured secrets (names only)..."
gh secret list

echo ""
success "All secrets configured successfully!"

echo ""
echo "Next steps:"
echo "  1. Commit your code to main branch: git push origin main"
echo "  2. Check GitHub Actions tab for deployment workflow"
echo "  3. Monitor logs: gcloud run logs read quickaishort-api --region=us-central1"
echo ""
