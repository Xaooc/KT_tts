param([switch]$ReaderOnly)
$ErrorActionPreference = 'Stop'
$taskOutput = 'C:\dev\KT\output'
$ttsRoot = 'C:\Users\PC\Documents\My Games\Tabletop Simulator'
$reportPath = Join-Path $taskOutput 'installation-workshop.json'
$previous = @()
if (Test-Path -LiteralPath $reportPath -PathType Leaf) {
    $previous = @((Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json).files)
}
$pairs = @(
    @{ Source = Join-Path $taskOutput 'KT24-The-Killzone-RU-assets-working.json'; Destination = Join-Path $ttsRoot 'Mods\Workshop\3573927734_RU.json' },
    @{ Source = Join-Path $taskOutput 'KT24-The-Killzone-RU-assets-working.json'; Destination = Join-Path $ttsRoot 'Saves\KT24-The-Killzone-RU.json' },
    @{ Source = Join-Path $taskOutput 'KT41-RU-assets-working.json'; Destination = Join-Path $ttsRoot 'Saves\Saved Objects\KT41-RU.json' }
)
if ($ReaderOnly) { $pairs = @($pairs | Where-Object { $_.Destination -notlike '*\Saved Objects\*' }) }
$assetReport = Get-Content -LiteralPath (Join-Path $taskOutput 'asset-integration-report.json') -Raw | ConvertFrom-Json
foreach ($asset in $assetReport.assets) {
    if (!(Test-Path -LiteralPath $asset.translatedPath -PathType Leaf)) { throw "Missing translated asset: $($asset.translatedPath)" }
    if ((Get-FileHash -LiteralPath $asset.translatedPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256) { throw "Translated asset changed: $($asset.translatedPath)" }
}
$originalPath = Join-Path $ttsRoot 'Mods\Workshop\3573927734.json'
$originalHash = (Get-FileHash -LiteralPath $originalPath -Algorithm SHA256).Hash
foreach ($pair in $pairs) {
    if (!(Test-Path -LiteralPath $pair.Source -PathType Leaf)) { throw "Missing built file: $($pair.Source)" }
    if (!(Test-Path -LiteralPath (Split-Path -Parent $pair.Destination) -PathType Container)) { throw "Missing destination directory: $($pair.Destination)" }
    $pair.Hash = (Get-FileHash -LiteralPath $pair.Source -Algorithm SHA256).Hash.ToLowerInvariant()
    if (Test-Path -LiteralPath $pair.Destination -PathType Leaf) {
        $existingHash = (Get-FileHash -LiteralPath $pair.Destination -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($existingHash -ne $pair.Hash) {
            $owned = @($previous | Where-Object { $_.destination -eq $pair.Destination -and $_.sha256 -eq $existingHash })
            if ($owned.Count -ne 1) { throw "Existing unrelated or edited file was preserved: $($pair.Destination)" }
            $pair.ReplaceOwnedHash = $existingHash
        }
    }
}
foreach ($pair in $pairs) {
    if (!(Test-Path -LiteralPath $pair.Destination)) { [System.IO.File]::Copy($pair.Source, $pair.Destination, $false) }
    elseif ($pair.ReplaceOwnedHash) {
        if ((Get-FileHash -LiteralPath $pair.Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pair.ReplaceOwnedHash) { throw "Destination changed during installation: $($pair.Destination)" }
        [System.IO.File]::Copy($pair.Source, $pair.Destination, $true)
    }
    if ((Get-FileHash -LiteralPath $pair.Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pair.Hash) { throw "Installed file differs: $($pair.Destination)" }
}
if ((Get-FileHash -LiteralPath $originalPath -Algorithm SHA256).Hash -ne $originalHash) { throw 'Original Workshop file changed during installation' }
$result = @{
    scope = $(if ($ReaderOnly) { 'reader-fix' } else { 'full-mod' })
    installedAt = [DateTime]::UtcNow.ToString('o')
    completeTranslation = $true
    nativeTTSRuntimeTested = $false
    originalPath = $originalPath
    originalSHA256 = $originalHash.ToLowerInvariant()
    installedImages = @($assetReport.assets | Where-Object { $_.kind -eq 'image' }).Count
    installedPDFs = @($assetReport.assets | Where-Object { $_.kind -eq 'pdf' }).Count
    files = @($pairs | ForEach-Object { @{ source=$_.Source; destination=$_.Destination; sha256=$_.Hash } })
}
if ($ReaderOnly) {
    $ktPreservedPack = Join-Path $ttsRoot 'Saves\Saved Objects\KT41-RU.json'
    $result.preservedFiles = @(@{ path=$ktPreservedPack; sha256=(Get-FileHash -LiteralPath $ktPreservedPack -Algorithm SHA256).Hash.ToLowerInvariant(); reason='Reader repair changes only the table HUD; installed team pack has local changes.' })
}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding utf8
$result | ConvertTo-Json -Depth 5
