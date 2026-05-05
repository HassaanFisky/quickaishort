$envFile = Get-Content "fastapi/.env"
$envVars = @()
foreach ($line in $envFile) {
    $line = $line.Trim()
    if ($line.StartsWith("#") -or [string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -like "*=*") {
        $key = $line.Substring(0, $line.IndexOf("=")).Trim()
        $val = $line.Substring($line.IndexOf("=") + 1).Trim()
        if ($val) {
            $envVars += "$key=$val"
        }
    }
}
$envVarString = $envVars -join ","
Write-Output $envVarString
