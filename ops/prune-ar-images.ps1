# FinOps: prune Artifact Registry digests — keep newest N tagged images.
# Usage (PowerShell): .\ops\prune-ar-images.ps1
# Does NOT delete Cloud Run services. Regenerable build artifacts only.

$ErrorActionPreference = "Continue"
$env:CLOUDSDK_CONFIG = "E:\gcloud-config"
$env:TMP = "E:\gcloud-temp"
$Project = "quickaishort-agent-494304"
$Keep = 5
$Images = @(
  "us-central1-docker.pkg.dev/$Project/cloud-run-source-deploy/quickaishort/quickai-api",
  "us-central1-docker.pkg.dev/$Project/cloud-run-source-deploy/quickaishort/quickai-worker"
)

foreach ($image in $Images) {
  Write-Host "=== $image ==="
  $versions = @(
    gcloud artifacts docker images list $image `
      --include-tags `
      --project=$Project `
      --sort-by="~UPDATE_TIME" `
      --format="value(version)" 2>$null |
      Where-Object { $_ -match "^sha256:" }
  )
  Write-Host "total digests: $($versions.Count)"
  if ($versions.Count -le $Keep) {
    Write-Host "nothing to prune"
    continue
  }
  $dead = $versions | Select-Object -Skip $Keep
  Write-Host "deleting $($dead.Count) old digests (async)..."
  $i = 0
  foreach ($v in $dead) {
    $i++
    if (($i % 25) -eq 0) { Write-Host "  progress $i / $($dead.Count)" }
    gcloud artifacts docker images delete "${image}@$v" `
      --project=$Project `
      --delete-tags `
      --async `
      --quiet 2>$null | Out-Null
  }
  Write-Host "queued deletes for $image"
}

Write-Host "PRUNE_QUEUED - AR GC may take minutes; sizes drop as ops finish."
