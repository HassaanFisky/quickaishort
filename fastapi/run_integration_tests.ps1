# Integration Test Startup Script for Windows PowerShell
# Usage: powershell -ExecutionPolicy Bypass -File fastapi/run_integration_tests.ps1

$ErrorActionPreference = "Continue"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Video API Integration Test Suite" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Get paths
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$FASTAPI_DIR = Join-Path $PROJECT_ROOT "fastapi"

Write-Host "Project Root: $PROJECT_ROOT" -ForegroundColor Gray
Write-Host "FastAPI Dir:  $FASTAPI_DIR" -ForegroundColor Gray
Write-Host ""

# Check Python
Write-Host "Checking Python installation..."
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  Write-Host "✗ Python not found. Please install Python 3.12+" -ForegroundColor Red
  exit 1
}
$pythonVersion = & python --version 2>&1
Write-Host "✓ $pythonVersion found" -ForegroundColor Green
Write-Host ""

# Check Redis (best effort)
Write-Host "Checking Redis..."
$redis = Get-Command redis-cli -ErrorAction SilentlyContinue
if ($redis) {
  try {
    $redisTest = & redis-cli ping 2>&1
    if ($redisTest -eq "PONG") {
      Write-Host "✓ Redis is running" -ForegroundColor Green
    } else {
      Write-Host "⚠ Redis CLI found but not responding" -ForegroundColor Yellow
    }
  } catch {
    Write-Host "⚠ Could not reach Redis at localhost:6379" -ForegroundColor Yellow
    Write-Host "   Start Redis with: redis-server" -ForegroundColor Gray
    Write-Host "   Or with Docker: docker run -d -p 6379:6379 redis:latest" -ForegroundColor Gray
  }
} else {
  Write-Host "⚠ Redis CLI not found (install with: choco install redis)" -ForegroundColor Yellow
}
Write-Host ""

# Setup venv
Write-Host "Setting up Python virtual environment..."
$venvPath = Join-Path $FASTAPI_DIR "venv"
if (-not (Test-Path $venvPath)) {
  Write-Host "Creating venv..."
  & python -m venv $venvPath
  Write-Host "✓ Virtual environment created" -ForegroundColor Green
} else {
  Write-Host "✓ Virtual environment exists" -ForegroundColor Green
}
Write-Host ""

# Activate venv
$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
if (Test-Path $activateScript) {
  & $activateScript
  Write-Host "✓ Virtual environment activated" -ForegroundColor Green
} else {
  Write-Host "✗ Could not find activation script" -ForegroundColor Red
  exit 1
}
Write-Host ""

# Install dependencies
Write-Host "Installing dependencies..."
$requirementsFile = Join-Path $FASTAPI_DIR "requirements.txt"
& pip install -q -r $requirementsFile 2>&1 | Where-Object { $_ -notmatch "already satisfied" } | Select-Object -First 5
& pip install -q httpx
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Create .env file
Write-Host "Checking environment configuration..."
$envFile = Join-Path $FASTAPI_DIR ".env"
if (-not (Test-Path $envFile)) {
  Write-Host "Creating .env file..."
  $envContent = @"
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
"@
  Set-Content -Path $envFile -Value $envContent -Encoding UTF8
  Write-Host "✓ .env file created" -ForegroundColor Green
} else {
  Write-Host "✓ .env file exists" -ForegroundColor Green
}
Write-Host ""

# Verify FastAPI
Write-Host "Verifying FastAPI application..."
try {
  & python -c "import main" 2>&1 | Out-Null
  Write-Host "✓ FastAPI application ready" -ForegroundColor Green
} catch {
  Write-Host "⚠ Could not import main module (will be verified when server starts)" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Ready to Start Integration Tests" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "Open 3 PowerShell windows and run these commands:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  PowerShell 1 (FastAPI Server):" -ForegroundColor Cyan
Write-Host "    cd $FASTAPI_DIR" -ForegroundColor Gray
Write-Host "    .\venv\Scripts\Activate.ps1" -ForegroundColor Gray
Write-Host "    uvicorn main:app --reload --port 8000 --log-level info" -ForegroundColor Gray
Write-Host ""
Write-Host "  PowerShell 2 (Celery Worker):" -ForegroundColor Cyan
Write-Host "    cd $FASTAPI_DIR" -ForegroundColor Gray
Write-Host "    .\venv\Scripts\Activate.ps1" -ForegroundColor Gray
Write-Host "    celery -A workers.tasks worker --loglevel=info --concurrency=1" -ForegroundColor Gray
Write-Host ""
Write-Host "  PowerShell 3 (Run Tests):" -ForegroundColor Cyan
Write-Host "    cd $FASTAPI_DIR" -ForegroundColor Gray
Write-Host "    .\venv\Scripts\Activate.ps1" -ForegroundColor Gray
Write-Host "    python tests/test_video_api.py --token 'test-token-dev' --url 'http://localhost:8000'" -ForegroundColor Gray
Write-Host ""
Write-Host "Full docs: docs/INTEGRATION_TEST_SETUP.md" -ForegroundColor Gray
Write-Host ""
