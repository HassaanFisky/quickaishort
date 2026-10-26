# QuickAI Studio - Commercial Standalone Release Packager (Windows and macOS Ready)
# Verifies EP-001 and locale registries, builds Next.js production output (or uses fresh .next if -SkipFrontendBuild),
# and stages the standalone desktop distribution bundle in dist/QuickAI-Studio-Standalone.

param(
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$FastApiDir = Join-Path $RepoRoot "fastapi"
$FrontendDir = Join-Path $RepoRoot "frontend"
$DesktopDir = Join-Path $RepoRoot "desktop"
$ReleaseDir = Join-Path $RepoRoot "dist\QuickAI-Studio-Standalone"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     QUICKAI STUDIO - COMMERCIAL RELEASE PACKAGER         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$UserBin = "C:\Users\DELL\bin"
if (Test-Path $UserBin) {
    $env:Path = "$UserBin;$env:Path"
}

$PythonExe = Join-Path $FastApiDir "venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "C:\Users\DELL\.gemini\antigravity\scratch\quickaishort\fastapi\venv\Scripts\python.exe"
}
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python.exe"
}

Write-Host "[1/4] Verifying EP-001 Capability and Locale Registry Sync..." -ForegroundColor Green
& $PythonExe (Join-Path $FastApiDir "scripts\check_registry_sync.py")
if ($LASTEXITCODE -ne 0) { throw "Registry sync check failed." }

$NextBuildId = Join-Path $FrontendDir ".next\BUILD_ID"
if (-not $SkipFrontendBuild -or -not (Test-Path $NextBuildId)) {
    Write-Host "[2/4] Building Next.js Production Studio Bundle..." -ForegroundColor Green
    Set-Location $FrontendDir
    $env:NEXT_PUBLIC_STUDIO_PROJECT_KERNEL = "1"
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "Frontend production build failed." }
    Set-Location $RepoRoot
} else {
    Write-Host "[2/4] Fresh Next.js Production Build (.next/BUILD_ID) verified - skipping redundant rebuild." -ForegroundColor Green
}

Write-Host "[3/4] Staging Standalone Desktop Release Bundle in $ReleaseDir..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
Copy-Item -Path (Join-Path $RepoRoot "start-studio.ps1") -Destination $ReleaseDir -Force
Copy-Item -Path (Join-Path $DesktopDir "*") -Destination $ReleaseDir -Recurse -Force

$WinLauncher = @'
@echo off
title QuickAI Studio - Local-First Standalone Launcher
set LOCAL_FIRST_MODE=1
set LOCAL_FIRST_DEV_NO_AUTH=1
set MOCK_AI_MODE=0
set NEXT_PUBLIC_LOCAL_FIRST_MODE=1
set NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1
set NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
set NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
set EXPORT_SIGNING_SECRET=local-studio-export-signing-secret-dev-only
set NEXTAUTH_SECRET=quickai-studio-local-dev-secret-key-32chars
set NEXTAUTH_URL=http://localhost:3000
set PORT=3000
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\start-studio.ps1"
'@
Set-Content -Path (Join-Path $ReleaseDir "launch-QuickAI-Studio.bat") -Value $WinLauncher -Encoding ASCII

$UnixLauncher = @'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
export LOCAL_FIRST_MODE=1
export LOCAL_FIRST_DEV_NO_AUTH=1
export MOCK_AI_MODE=0
export NEXT_PUBLIC_LOCAL_FIRST_MODE=1
export NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1
export NEXT_PUBLIC_API_URL="http://127.0.0.1:8000"
export NEXT_PUBLIC_BACKEND_URL="http://127.0.0.1:8000"
export EXPORT_SIGNING_SECRET="local-studio-export-signing-secret-dev-only"
export NEXTAUTH_SECRET="quickai-studio-local-dev-secret-key-32chars"
export NEXTAUTH_URL="http://localhost:3000"
export PORT="3000"

echo "Starting QuickAI Studio FastAPI Backend on http://127.0.0.1:8000 ..."
(cd "$REPO_ROOT/fastapi" && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000) &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT

echo "Starting QuickAI Studio Frontend on http://localhost:3000 ..."
cd "$REPO_ROOT/frontend"
pnpm start -p 3000
'@
Set-Content -Path (Join-Path $ReleaseDir "launch-QuickAI-Studio.sh") -Value $UnixLauncher -Encoding ASCII

Write-Host "[4/4] Standalone Commercial Bundle Ready at: $ReleaseDir" -ForegroundColor Green
Write-Host "  - Windows Launcher:   dist/QuickAI-Studio-Standalone/launch-QuickAI-Studio.bat" -ForegroundColor Yellow
Write-Host "  - macOS/Linux Script: dist/QuickAI-Studio-Standalone/launch-QuickAI-Studio.sh" -ForegroundColor Yellow
Write-Host "  - Desktop Supervisor: dist/QuickAI-Studio-Standalone/main.js" -ForegroundColor Yellow
Write-Host "  - Installer Targets:  dist/QuickAI-Studio-Standalone/electron-builder.yml (.dmg, .zip, NSIS .exe, portable)" -ForegroundColor Yellow
