$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/beauty-icons-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/tabbar-return/native'))
[IO.Directory]::CreateDirectory($out)|Out-Null
if([IO.File]::ReadAllText((Join-Path $project 'config.js')) -notmatch '127\.0\.0\.1:9'){throw 'Offline project required'}
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'tabbar-return-native.js')).Replace("`r",'').Replace("`n",' ')
function Ide([string]$tool,[string[]]$flags){$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
$checks=@()
$cases=@(@('ledger','/pages/ledger-history/index'),@('ledger','/pages/member-tools/index?mode=budgets'),@('items','/pages/item/index?id=1'),@('items','/pages/wishlist/index'),@('statistics','/pages/ledger-report/index'),@('statistics','/pages/insights/index'),@('me','/pages/profile/index'),@('me','/pages/membership/index'))
foreach($case in $cases){
 $argsFile=Join-Path $out 'args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @($case[0],$case[1]) -Compress))
 $s=(Ide automation_evaluate @('--fn-source',$source,'--args-file',$argsFile)).result.result
 if(!$s.samePage -or $s.route -ne ('pages/'+$case[0]+'/index') -or $s.selected -ne $s.route -or $s.hidden -or $s.menuOpen -or $s.customBars -ne 1 -or $s.barHeight -lt 60 -or $s.stack -ne 1){throw ($s|ConvertTo-Json -Compress)}
 $checks+=@{passed=$true;state=$s};Write-Output ('Returned to '+$s.route+' with one custom bar')
 Ide simulator_screenshot @('--path',(Join-Path $out ($case[0]+'-'+$checks.Count+'.png')),'--optimize','false','--wait','1')|Out-Null
}
@{passed=$true;checks=$checks;fixtureOnly=$true;realDevice=$false;cloudWrites=0;realPayments=0}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $out 'results.json') -Encoding UTF8
