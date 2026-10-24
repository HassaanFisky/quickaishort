# QuickAI Studio -- 1-Click Windows Local Launcher
# Launches the FastAPI backend (with SQLite + Local GCS + FFmpeg) and Next.js frontend

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$FastApiDir = Join-Path $RepoRoot "fastapi"
$FrontendDir = Join-Path $RepoRoot "frontend"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "             LAUNCHING QUICKAI STUDIO (LOCAL)             " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Ensure local FFmpeg binaries in user bin are added to PATH
$UserBin = "C:\Users\DELL\bin"
if (Test-Path $UserBin) {
    $env:Path = "$UserBin;$env:Path"
}

# Set local zero-spend environment variables
$env:LOCAL_FIRST_MODE = "1"
$env:MOCK_AI_MODE = "1"
$env:PORT = "8000"

# Determine Python path
$PythonExe = Join-Path $FastApiDir "venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = Join-Path "C:\Users\DELL\.gemini\antigravity\scratch\quickaishort\fastapi\venv\Scripts\python.exe"
}
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python.exe"
}

Write-Host "[1/2] Starting FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Green
$BackendCmd = "Set-Location '$FastApiDir'; if (Test-Path '$UserBin') { `$env:Path = '$UserBin;' + `$env:Path }; `$env:LOCAL_FIRST_MODE='1'; `$env:MOCK_AI_MODE='1'; & '$PythonExe' -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendCmd

Start-Sleep -Seconds 2

Write-Host "[2/2] Starting Next.js Studio Frontend on http://localhost:3000..." -ForegroundColor Green
Write-Host ""
Write-Host ">>> OPEN YOUR BROWSER AT: http://localhost:3000" -ForegroundColor Yellow
Write-Host ""

Set-Location $FrontendDir
pnpm dev
