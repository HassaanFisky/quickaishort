$envFile = Get-Content "frontend/.env.local"
foreach ($line in $envFile) {
    $line = $line.Trim()
    if ($line.StartsWith("#") -or [string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -like "*=*") {
        $key = $line.Substring(0, $line.IndexOf("=")).Trim()
        $val = $line.Substring($line.IndexOf("=") + 1).Trim()
        if ($val) {
            Write-Output "Adding $key to Vercel..."
            Write-Output $val | vercel env add $key production --force
        }
    }
}
