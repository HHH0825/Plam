$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/release-notice-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/release-notice-20261018'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'release-notice-position.js')).Replace("`r",'').Replace("`n",' ')
$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex automation_evaluate --project $project --fn-source $source|Out-String)
$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
if(!$r.ok -or !$r.result.success){throw $raw}
$s=$r.result.result.result
if($s.open -or $s.before -lt 10 -or [Math]::Abs($s.before-$s.after) -gt 1){throw ($s|ConvertTo-Json -Compress)}
$file=Join-Path $out 'native-results.json';$data=[IO.File]::ReadAllText($file)|ConvertFrom-Json
$name='Closing the update notice preserves page scroll position'
$data.checks=@($data.checks|Where-Object {$_.name -ne $name})+@{name=$name;passed=$true;state=$s}
[IO.File]::WriteAllText($file,($data|ConvertTo-Json -Depth 12))
Write-Output ($s|ConvertTo-Json -Compress)
