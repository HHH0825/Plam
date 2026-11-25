$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/motion-20261018'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$checks=[System.Collections.Generic.List[object]]::new()
foreach($name in @('pages/items/index','pages/disposed/index','pages/me/index','pages/membership/index','pages/ledger/index','pages/statistics/index','pages/ledger-record/index','pages/member-tools/index','pages/rewards/index','pages/editor/index','custom-tab-bar/index')){foreach($ext in @('wxml','wxss')){
 Start-Sleep -Milliseconds 1800
 $raw=(& $wechatIde -c Codex ('compile_'+$ext) --project $project --file-path ($name+'.'+$ext)|Out-String)
 if($raw.IndexOf('{') -lt 0){throw $raw}
 $r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$r.ok -or !$r.result.success){throw $raw}
 $checks.Add(@{file=($name+'.'+$ext);passed=$true})
}}
[IO.File]::WriteAllText((Join-Path $output 'compile-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;deployed=$false} -Depth 8))
Write-Output "Compiled $($checks.Count) templates and styles"
