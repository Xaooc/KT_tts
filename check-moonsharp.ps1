param([string]$Path = 'C:\dev\KT\tmp\reference-hud-test.lua', [string]$ReportPath = '', [string]$SnapshotPath = '', [string]$SnapshotGlobal = 'PreviewCompactXml')
$ErrorActionPreference = 'Stop'
$ktProject = Join-Path $PSScriptRoot 'tools-src\moonsharp-runner\MoonSharpRunner.csproj'
$ktSource = Join-Path $PSScriptRoot 'tools-src\moonsharp-runner\Program.cs'
$ktProps = Join-Path $PSScriptRoot 'tools-src\moonsharp-runner\Directory.Build.props'
$ktRunner = Join-Path $PSScriptRoot 'tmp\moonsharp-runner\MoonSharpRunner.dll'
$ktDotnet = 'C:\Program Files\dotnet\dotnet.exe'
$ktLibrary = 'C:\Program Files (x86)\Steam\steamapps\common\Tabletop Simulator\Tabletop Simulator_Data\Managed\MoonSharp.Interpreter.dll'
if (Test-Path -LiteralPath $ktProject) {
    $ktNeedsBuild = -not (Test-Path -LiteralPath $ktRunner)
    if (-not $ktNeedsBuild) {
        $ktRunnerTime = (Get-Item -LiteralPath $ktRunner).LastWriteTimeUtc
        $ktInputs = @($ktProject, $ktSource, $ktProps, $ktLibrary)
        $ktNeedsBuild = @($ktInputs | Where-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc -gt $ktRunnerTime }).Count -gt 0
    }
    if ($ktNeedsBuild) {
        & $ktDotnet build $ktProject --configuration Release --output (Split-Path -Parent $ktRunner) --verbosity quiet -p:NuGetAudit=false
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    $ktRunnerArgs = @('-Path', $Path)
    if ($ReportPath) { $ktRunnerArgs += @('-ReportPath', $ReportPath) }
    if ($SnapshotPath) { $ktRunnerArgs += @('-SnapshotPath', $SnapshotPath) }
    if ($SnapshotGlobal) { $ktRunnerArgs += @('-SnapshotGlobal', $SnapshotGlobal) }
    & $ktDotnet $ktRunner @ktRunnerArgs
    exit $LASTEXITCODE
}

Add-Type -Path 'C:\Program Files (x86)\Steam\steamapps\common\Tabletop Simulator\Tabletop Simulator_Data\Managed\MoonSharp.Interpreter.dll'
$ktLua = [MoonSharp.Interpreter.Script]::new()
$ktSource = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
try {
    $ktResult = $ktLua.DoString($ktSource, $null, $Path)
    if ($SnapshotPath) {
        function Convert-KtLuaValue($ktValue) {
            switch ($ktValue.Type.ToString()) {
                'Table' {
                    $ktMap = [ordered]@{}
                    foreach ($ktPair in $ktValue.Table.Pairs) {
                        $ktKey = if ($ktPair.Key.Type.ToString() -eq 'String') { $ktPair.Key.String } else { $ktPair.Key.Number.ToString([Globalization.CultureInfo]::InvariantCulture) }
                        $ktMap[$ktKey] = Convert-KtLuaValue $ktPair.Value
                    }
                    return $ktMap
                }
                'String' { return $ktValue.String }
                'Number' { return $ktValue.Number }
                'Boolean' { return $ktValue.Boolean }
                default { return $null }
            }
        }
        $ktSnapshot = Convert-KtLuaValue ($ktLua.Globals.Get($SnapshotGlobal))
        [IO.File]::WriteAllText($SnapshotPath,($ktSnapshot | ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
    }
    $ktReport = @{ passed=$true; engine=$ktLua.DoString('return _VERSION',$null,'version').String; result=$ktResult.ToString(); script=$Path; library='Tabletop Simulator_Data/Managed/MoonSharp.Interpreter.dll'; inGameUIAutomationTested=$false }
    $ktJson = $ktReport | ConvertTo-Json
    if ($ReportPath) { [System.IO.File]::WriteAllText($ReportPath,$ktJson,[System.Text.UTF8Encoding]::new($false)) }
    $ktJson
} catch {
    $ktError = $_.Exception.InnerException
    if ($ktError.DecoratedMessage) { Write-Output $ktError.DecoratedMessage }
    if ($ktError.CallStack) { Write-Output $ktError.CallStack }
    throw
}
