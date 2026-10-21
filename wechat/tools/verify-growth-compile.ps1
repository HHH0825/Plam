$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/growth-20261018'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$checks=[System.Collections.Generic.List[object]]::new()
foreach($name in @('pages/membership/index','pages/me/index','pages/rewards/index','components/cat-feedback/index')){foreach($ext in @('wxml','wxss')){
 Start-Sleep -Milliseconds 1800
 $raw=(& 'wechat-devtools/wechatide.cmd' -c Codex ('compile_'+$ext) --project $project --file-path ($name+'.'+$ext)|Out-String)
 if($raw.IndexOf('{') -lt 0){throw $raw}
 $r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$r.ok -or !$r.result.success){throw $raw}
 $checks.Add(@{file=($name+'.'+$ext);passed=$true})
}}
[IO.File]::WriteAllText((Join-Path $output 'compile-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;deployed=$false} -Depth 10))
Write-Output "Compiled $($checks.Count) changed templates and styles"
