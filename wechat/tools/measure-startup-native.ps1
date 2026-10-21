param([string]$Label='before')
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/beauty-icons-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/startup-share-20261020'))
if([IO.File]::ReadAllText((Join-Path $project 'config.js')) -notmatch '127\.0\.0\.1:9'){throw 'Offline project required'}
function Ide([string]$tool,[string[]]$flags){
 $raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String)
 if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$r.ok -or !$r.result.success){
  if($tool -eq 'automation_evaluate'){
   $raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
  }
  if(!$r.ok -or !$r.result.success){throw $raw}
 };return $r.result
}
$fn='function(){return {qa:getApp()._qa,route:getCurrentPages().map(p=>p.route),ready:!getCurrentPages().slice(-1)[0]?.data.busy}}'
$samples=@()
for($i=0;$i -lt 5;$i++){
 Ide simulator_open_page @('--page','pages/items/index')|Out-Null
 Start-Sleep -Milliseconds 1800
 $s=(Ide automation_evaluate @('--fn-source',$fn)).result.result
 for($j=0;$j -lt 10 -and !($s.qa.events|Where-Object {$_.event -eq 'heroLoaded'});$j++){
  Start-Sleep -Milliseconds 1000;$s=(Ide automation_evaluate @('--fn-source',$fn)).result.result
 }
 if(!($s.qa.events|Where-Object {$_.event -eq 'heroLoaded'})){throw ($s|ConvertTo-Json -Depth 10)}
 $samples+=@{sample=$i;runtime=$s};Write-Output ($Label+' sample '+$i+' loginReady='+($s.qa.events|Where-Object {$_.route -eq 'pages/login/index' -and $_.event -eq 'onReady'}|Select-Object -First 1).at)
 @{label=$Label;fixtureOnly=$true;realDevice=$false;downloadBenchmark=$false;kind='Native simulator recompile from items entry; local cached package';samples=$samples}|ConvertTo-Json -Depth 15|Set-Content -LiteralPath (Join-Path $out ($Label+'-native.json')) -Encoding UTF8
}
@{label=$Label;fixtureOnly=$true;realDevice=$false;downloadBenchmark=$false;kind='Native simulator recompile from items entry; local cached package';samples=$samples}|ConvertTo-Json -Depth 15|Set-Content -LiteralPath (Join-Path $out ($Label+'-native.json')) -Encoding UTF8
