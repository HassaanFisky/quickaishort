$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$b1 = New-Object byte[] 32
$rng.GetBytes($b1)
Write-Output "NEXTAUTH_SECRET:$([System.Convert]::ToBase64String($b1))"

$b2 = New-Object byte[] 32
$rng.GetBytes($b2)
Write-Output "EXPORT_SIGNING_SECRET:$([System.BitConverter]::ToString($b2).Replace('-', '').ToLower())"
