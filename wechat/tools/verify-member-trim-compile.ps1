$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/member-trim-20261017'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$checks=[System.Collections.Generic.List[object]]::new()
foreach($file in @('pages/member-tools/index','pages/statistics/index','pages/ledger-detail/index','pages/membership/index','pages/me/index','pages/member-benefits/index')){foreach($ext in @('wxml','wxss')){
 $raw=(& 'wechat-devtools/wechatide.cmd' -c Codex ('compile_'+$ext) --project $project --file-path ($file+'.'+$ext)|Out-String)
 $r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$r.ok -or !$r.result.success){throw $raw}
 $checks.Add(@{file=($file+'.'+$ext);passed=$true})
}}
[IO.File]::WriteAllText((Join-Path $output 'compile-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;compiledFiles=$checks.Count;deployed=$false} -Depth 10))
Write-Output "Compiled $($checks.Count) changed page templates and styles"
