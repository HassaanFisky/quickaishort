# Delete ALL digests for a retired image path (async). Regenerable only.
# Example: .\ops\wipe-ar-image.ps1 -ImagePath "quickaishort/quickaishort-backend"

param(
  [Parameter(Mandatory = $true)]
  [string]$ImagePath,
  [string]$Project = "quickaishort-agent-494304",
  [string]$Location = "us-central1",
  [string]$Repository = "cloud-run-source-deploy"
)

$ErrorActionPreference = "Continue"
$env:CLOUDSDK_CONFIG = "E:\gcloud-config"
$env:TMP = "E:\gcloud-temp"
$image = "$Location-docker.pkg.dev/$Project/$Repository/$ImagePath"
Write-Host "Wiping digests for $image"
$vers = @(
  gcloud artifacts docker images list $image --project=$Project --format="value(version)" 2>$null |
    Where-Object { $_ -match "^sha256:" }
)
Write-Host "found $($vers.Count)"
$i = 0
foreach ($v in $vers) {
  $i++
  if (($i % 50) -eq 0) { Write-Host "queued $i / $($vers.Count)" }
  gcloud artifacts docker images delete "${image}@$v" --project=$Project --delete-tags --async --quiet 2>$null | Out-Null
}
Write-Host "queued $($vers.Count) deletes"
