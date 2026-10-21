$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/monthly-balance-20261012'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'monthly-balance-native-check.js')).Replace("`r",'').Replace("`n",' ')
$samplesJson=(& node -e "process.stdout.write(JSON.stringify(require('./wechat/tests/fixtures/monthly-balance.cjs')))"|Out-String).Trim()
$samples=$samplesJson|ConvertFrom-Json
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$result=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$result.ok -or !$result.result.success){throw $raw};return $result.result}
function ArgsFile($values){$file=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $values -Depth 25 -Compress));return $file}
function Run([string]$action,$payload=$null){return (Ide automation_evaluate @('--fn-source',$source,'--args-file',(ArgsFile @($action,$payload)))).result.result}
function Method([string]$name,$values=@()){Ide automation_page_action @('--action','callMethod','--method',$name,'--args-file',(ArgsFile $values))|Out-Null}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
function Shot([string]$name,[string]$selector){Run scroll $selector|Out-Null;Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1','--wait-for-selector',$selector)|Out-Null;Write-Output "Screenshot: $name"}
try{
 Run setup $samplesJson|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url','/pages/insights/index')|Out-Null
 foreach($key in @('recovery','net-expense','balanced','empty')){
  Run case $key|Out-Null;$current=Run inspect;$sample=$samples|Where-Object key -eq $key
  if(!$current.balance){throw (ConvertTo-Json -InputObject $current -Depth 20)}
  Check $current.balance.label $sample.label "Preview $key label";Check $current.balance.amount $sample.amount "Preview $key amount";Shot "preview-$key" '.monthly-brief'
 }
 Ide automation_navigate @('--action','navigateTo','--url','/pages/monthly/index')|Out-Null
 foreach($key in @('recovery','net-expense','balanced','principal-only')){
  Run case $key|Out-Null;$current=Run inspect;$sample=$samples|Where-Object key -eq $key
  Check $current.balance.label $sample.label "Report $key label";Check $current.balance.amount $sample.amount "Report $key amount";Check $current.report.totals.cashflow_net $sample.report.totals.cashflow_net "Report $key raw signed amount retained";Shot "report-$key" '.cashflow-row'
  if($key -ne 'principal-only'){
   $png=Run export
   [IO.File]::WriteAllBytes((Join-Path $output "$key-export-native.png"),[Convert]::FromBase64String($png.image))
   [IO.File]::WriteAllBytes((Join-Path $output "$key-cover-native.png"),[Convert]::FromBase64String($png.cover))
   Check ($png.image.Length -gt 1000 -and $png.cover.Length -gt 1000) $true "Report $key generates native PNG and cover"
  }
 }
 Method changeMonth @(@{detail=@{value='2026-09'}});$month=Run inspect;Check $month.month '2026-09' 'Month switch reloads correct edition';Check ($month.imageKey -match 'monthly-balance-20261012') $true 'New design version scopes image cache'
 $switched=Run account-switch;Check ($null -eq $switched.report -and $null -eq $switched.edition -and !$switched.imagePath -and !$switched.coverPath) $true 'Account switch clears report and image cache'
 $all=Run inspect;Check (@($all.calls|Where-Object method -ne 'GET').Count) 0 'No write requests made'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;remoteWrites=0;fixtureOnly=$true} -Depth 25))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null
 Run restore|Out-Null
 Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];p.onShow();return {fixture:!!getApp()._monthlyBalanceQA,route:p.route};}")|Out-Null
 Write-Output 'Original account and transport restored'
}
