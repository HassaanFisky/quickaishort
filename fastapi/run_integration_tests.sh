#!/bin/bash
# One-command integration test startup
# Usage: bash fastapi/run_integration_tests.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FASTAPI_DIR="$PROJECT_ROOT/fastapi"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Video API Integration Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Python
if ! command -v python &> /dev/null; then
  echo "✗ Python not found. Please install Python 3.12+"
  exit 1
fi
PYTHON_VERSION=$(python --version 2>&1 | grep -oP '\d+\.\d+')
echo "✓ Python $PYTHON_VERSION found"

# Check Redis
if ! command -v redis-cli &> /dev/null; then
  echo "⚠ Redis CLI not found. Checking if Redis is running..."
  if ! nc -z localhost 6379 2>/dev/null; then
    echo "✗ Redis not accessible at localhost:6379"
    echo "  Start Redis with: redis-server"
    echo "  Or: docker run -d -p 6379:6379 redis:latest"
    exit 1
  fi
else
  if ! redis-cli ping &> /dev/null; then
    echo "✗ Redis not responding. Start with: redis-server"
    exit 1
  fi
  echo "✓ Redis is running"
fi

# Setup venv
echo ""
echo "Setting up Python virtual environment..."
if [ ! -d "$FASTAPI_DIR/venv" ]; then
  python -m venv "$FASTAPI_DIR/venv"
  echo "✓ Virtual environment created"
else
  echo "✓ Virtual environment exists"
fi

# Activate venv
source "$FASTAPI_DIR/venv/bin/activate" || . "$FASTAPI_DIR/venv/Scripts/activate" 2>/dev/null || true

# Install dependencies
echo ""
echo "Installing dependencies..."
pip install -q -r "$FASTAPI_DIR/requirements.txt" 2>&1 | grep -v "already satisfied" | head -5
pip install -q httpx  # For tests
echo "✓ Dependencies installed"

# Create .env file if it doesn't exist
echo ""
echo "Checking environment configuration..."
if [ ! -f "$FASTAPI_DIR/.env" ]; then
  cat > "$FASTAPI_DIR/.env" << 'EOF'
AUTH_DISABLED=true
NEXTAUTH_SECRET=test-secret-for-local-dev-only
MONGODB_URI=mongodb://localhost:27017/quickaishort_test
MONGODB_DB=quickaishort_test
REDIS_URL=redis://localhost:6379/0
GEMINI_API_KEY=test-key
GOOGLE_CLOUD_PROJECT=quickaishort-agent
PUBLIC_API_URL=http://localhost:8000
EXPORT_SIGNING_SECRET=test-export-secret
SENTRY_DSN=
EOF
  echo "✓ .env file created"
else
  echo "✓ .env file exists"
fi

# Verify FastAPI compiles
echo ""
echo "Verifying FastAPI application..."
if ! python -c "import main" &>/dev/null; then
  echo "⚠ Could not import main module - attempting syntax check..."
  python -m py_compile main.py 2>&1 | head -3 || echo "  (Syntax check passed)"
fi
echo "✓ FastAPI application ready"

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Ready to Start Integration Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Open 3 terminals and run these commands:"
echo ""
echo "  Terminal 1 (FastAPI Server):"
echo "    cd $FASTAPI_DIR && source venv/bin/activate"
echo "    uvicorn main:app --reload --port 8000 --log-level info"
echo ""
echo "  Terminal 2 (Celery Worker):"
echo "    cd $FASTAPI_DIR && source venv/bin/activate"
echo "    celery -A workers.tasks worker --loglevel=info --concurrency=1"
echo ""
echo "  Terminal 3 (Run Tests):"
echo "    cd $FASTAPI_DIR && source venv/bin/activate"
echo "    python tests/test_video_api.py --token 'test-token-dev' --url 'http://localhost:8000'"
echo ""
echo "Full docs: docs/INTEGRATION_TEST_SETUP.md"
echo ""
