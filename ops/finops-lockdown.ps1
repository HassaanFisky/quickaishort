# Purpose: one-shot FinOps ops for QuickAI GCP project (Owner).
# Last-modified: 2026-08-02
# Does NOT delete media GCS bucket or live quickai-api / quickai-worker.

$ErrorActionPreference = "Continue"
$env:CLOUDSDK_CONFIG = "E:\gcloud-config"
$env:TMP = "E:\gcloud-temp"
$Project = "quickaishort-agent-494304"

Write-Host "1) Apply AR cleanup policies"
$policy = Join-Path $PSScriptRoot "artifact-registry-cleanup-policy.json"
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy --project=$Project --location=us-central1 --policy=$policy

Write-Host "2) Enforce Cloud Run min=0 + CPU throttling"
gcloud run services update quickai-api --project=$Project --region=us-central1 --min-instances=0 --max-instances=10 --cpu-throttling --quiet
gcloud run services update quickai-worker --project=$Project --region=us-central1 --min-instances=0 --max-instances=3 --cpu-throttling --quiet

Write-Host "3) Prune old digests (keep 5) — see prune-ar-images.ps1"
& (Join-Path $PSScriptRoot "prune-ar-images.ps1")

Write-Host "DONE. Re-check: gcloud artifacts repositories list --project=$Project"
