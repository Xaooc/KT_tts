param([string]$Path = 'C:\dev\KT\tmp\reference-hud-test.lua', [string]$ReportPath = '', [string]$SnapshotPath = '', [string]$SnapshotGlobal = 'PreviewCompactXml')
$ErrorActionPreference = 'Stop'
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
