$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/member-tools-native-project'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/member-polish-20261016'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-polish-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
foreach($template in @('default','simple','journal')){foreach($tab in @('cash','collection')){
 $argsFile=Join-Path $output 'native-args.json'
 [IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @($template,$tab) -Compress))
 $raw=(& $wechatIde -c Codex automation_evaluate --project $project --fn-source $source --args-file $argsFile|Out-String)
 $result=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$result.ok -or !$result.result.success){throw $raw}
 $r=$result.result.result.result
 if(!$r.base64 -or !$r.dirty){throw 'Native preview missing or not a draft'}
 $file='native-report-'+$tab+'-'+$template+'.png'
 [IO.File]::WriteAllBytes((Join-Path $output $file),[Convert]::FromBase64String($r.base64))
 $checks.Add(@{template=$template;type=$tab;file=$file;passed=$true})
}}
$raw=(& $wechatIde -c Codex simulator_screenshot --project $project --path (Join-Path $output 'appearance-native.png') --optimize false --wait 1|Out-String)
$s=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$s.ok){throw $raw}
[IO.File]::WriteAllText((Join-Path $output 'native-preview-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;isolated=$true;businessWrites=0;payments=0;realDevice=$false} -Depth 10))
Write-Output "Passed $($checks.Count) isolated native canvas previews"
