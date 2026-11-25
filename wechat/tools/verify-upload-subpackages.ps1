$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/beauty-icons-native-project'))
$output = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/upload-fix-native'))
[IO.Directory]::CreateDirectory($output) | Out-Null
$app = Get-Content -LiteralPath (Join-Path $project 'app.json') -Raw | ConvertFrom-Json
$routes = @($app.tabBar.list | ForEach-Object pagePath)
foreach ($package in $app.subPackages) { foreach ($page in $package.pages) { $routes += ($package.root + '/' + $page) } }
$checks = [System.Collections.Generic.List[object]]::new()
foreach ($name in $routes) { foreach ($ext in @('wxml', 'wxss')) {
    $raw = (& $wechatIde -c Codex ('compile_' + $ext) --project $project --file-path ($name + '.' + $ext) | Out-String)
    if ($raw.IndexOf('{') -lt 0) { throw $raw }
    $result = $raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
    if (!$result.ok -or !$result.result.success) { throw $raw }
    $checks.Add(@{ file = ($name + '.' + $ext); passed = $true })
} }
@{ passed = $true; checks = $checks; isolated = $true; cloudWrites = 0 } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $output 'compile-results.json') -Encoding UTF8
Write-Output "Compiled $($checks.Count) main/subpackage templates and styles"
& (Join-Path $PSScriptRoot 'verify-launch-native.ps1') -SkipCompile
