$ErrorActionPreference = 'Stop'
$taskOutput = 'C:\dev\KT\output'
$ttsSaveRoot = 'C:\Users\PC\Documents\My Games\Tabletop Simulator\Saves'
$installReportPath = Join-Path $taskOutput 'installation-preview-2.json'
$priorInstallation = @()
if (Test-Path -LiteralPath $installReportPath -PathType Leaf) { $priorInstallation = @(Get-Content -LiteralPath $installReportPath -Raw | ConvertFrom-Json) }
$installPairs = @(
    @{ Source = Join-Path $taskOutput 'KT24-The-Killzone-RU-preview-2.json'; Destination = Join-Path $ttsSaveRoot 'KT24-The-Killzone-RU-preview-2.json' },
    @{ Source = Join-Path $taskOutput 'KT41-RU-preview-2.json'; Destination = Join-Path $ttsSaveRoot 'Saved Objects\KT41-RU-preview-2.json' }
)
foreach ($pair in $installPairs) {
    if (!(Test-Path -LiteralPath $pair.Source -PathType Leaf)) { throw "Missing built file: $($pair.Source)" }
    if (!(Test-Path -LiteralPath (Split-Path -Parent $pair.Destination) -PathType Container)) { throw "Missing TTS destination directory: $($pair.Destination)" }
    if (Test-Path -LiteralPath $pair.Destination) {
        $existingHash = (Get-FileHash -LiteralPath $pair.Destination -Algorithm SHA256).Hash
        if ((Get-FileHash -LiteralPath $pair.Source -Algorithm SHA256).Hash -ne $existingHash) {
            $owned = @($priorInstallation | Where-Object { $_.destination -eq $pair.Destination -and $_.source -eq $pair.Source -and $_.sha256 -eq $existingHash.ToLowerInvariant() })
            if ($owned.Count -ne 1) { throw "Existing destination differs; it was preserved: $($pair.Destination)" }
            $pair.ReplaceOwnedHash = $existingHash
        }
    }
}
foreach ($pair in $installPairs) {
    if (!(Test-Path -LiteralPath $pair.Destination)) { [System.IO.File]::Copy($pair.Source, $pair.Destination, $false) }
    elseif ($pair.ReplaceOwnedHash) {
        if ((Get-FileHash -LiteralPath $pair.Destination -Algorithm SHA256).Hash -ne $pair.ReplaceOwnedHash) { throw "Destination changed after ownership verification: $($pair.Destination)" }
        [System.IO.File]::Copy($pair.Source, $pair.Destination, $true)
    }
    $sourceHash = (Get-FileHash -LiteralPath $pair.Source -Algorithm SHA256).Hash
    $installedHash = (Get-FileHash -LiteralPath $pair.Destination -Algorithm SHA256).Hash
    if ($sourceHash -ne $installedHash) { throw "Installed copy mismatch: $($pair.Destination)" }
}
$installReport = $installPairs | ForEach-Object { @{ source=$_.Source; destination=$_.Destination; sha256=(Get-FileHash -LiteralPath $_.Destination -Algorithm SHA256).Hash.ToLowerInvariant() } }
$installReport | ConvertTo-Json | Set-Content -LiteralPath $installReportPath -Encoding utf8
$installReport | ConvertTo-Json
