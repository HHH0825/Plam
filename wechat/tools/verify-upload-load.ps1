$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/beauty-icons-native-project'))
$output = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/upload-fix-native'))
$source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'upload-subpackages-native.js')).Replace("`r", '').Replace("`n", ' ')
$checks = [System.Collections.Generic.List[object]]::new()
foreach ($name in @('member-tools', 'editor', 'rewards', 'item', 'monthly', 'fixed-expenses', 'storage-locations', 'membership')) {
    $argsPath = Join-Path $output 'load-args.json'
    [IO.File]::WriteAllText($argsPath, (ConvertTo-Json -InputObject @($name) -Compress))
    $raw = (& 'wechat-devtools/wechatide.cmd' -c Codex automation_evaluate --project $project --fn-source $source --args-file $argsPath | Out-String)
    if ($raw.IndexOf('{') -lt 0) { throw $raw }
    $result = $raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
    if (!$result.ok -or !$result.result.success) { throw $raw }
    $value = $result.result.result.result
    if (!$value.passed) { throw $raw }
    $checks.Add($value)
}
@{ passed = $true; checks = $checks; cloudWrites = 0; realPayments = 0 } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $output 'load-results.json') -Encoding UTF8
Write-Output 'Opened all 8 subpackage pages through native navigation in isolated runtime'
