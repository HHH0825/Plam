param([switch]$ExportsOnly)
$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/cash-redesign-20261014'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'cash-redesign-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$argsFile=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 30));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$argsFile)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$label){if(!$condition){throw $label};$checks.Add($label)}
$original=(Ide automation_evaluate @('--fn-source','function(){return getCurrentPages().slice(-1)[0].route}')).result.result
$fixture=(& node (Join-Path $PSScriptRoot 'cash-redesign-native-fixture.cjs')|Out-String)|ConvertFrom-Json
if($ExportsOnly){
 try{
  Run setup $fixture|Out-Null
  Ide automation_navigate @('--action','navigateTo','--url','/pages/ledger-report/index?month=2026-10','--wait','1')|Out-Null
  Run wait-route 'pages/ledger-report/index'|Out-Null;Run settle|Out-Null
  $export=Run export;[IO.File]::WriteAllBytes((Join-Path $output 'export-full-native.png'),[Convert]::FromBase64String($export.base64))
  Run mask|Out-Null
  $export=Run export;[IO.File]::WriteAllBytes((Join-Path $output 'export-hidden-native.png'),[Convert]::FromBase64String($export.base64))
  Write-Output 'Both native report exports refreshed'
 }finally{
  Run restore|Out-Null
  if($original -in @('pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index')){Ide automation_navigate @('--action','switchTab','--url',('/'+$original),'--wait','1')|Out-Null}
 }
 exit
}
$compiled=0
foreach($file in @('pages/ledger/index','pages/me/index','pages/statistics/index','pages/ledger-report/index','components/cash-donut/index')){foreach($ext in @('wxml','wxss')){Ide ('compile_'+$ext) @('--file-path',"$file.$ext")|Out-Null;$compiled++}}
try{
 Run setup $fixture|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/ledger/index','--wait','1')|Out-Null
 Run reload|Out-Null;Run settle|Out-Null;$s=Run state
 Check ($s.summary.expenseText -eq '3,140.50' -and !$s.error) 'Ledger exact refund adjusted summary';Shot ledger-panel
 $lg=Run geometry;Check ($null -ne $lg.rects[0] -and $lg.rects[2].left -ge $lg.rects[0].left) 'Book panel and left aligned amount render'
 Ide automation_navigate @('--action','switchTab','--url','/pages/me/index','--wait','1')|Out-Null
 Run settle|Out-Null;$s=Run state;Check (!$s.cashError -and $s.cash.Count -eq 3 -and $s.cash[2].display -eq '¥2,859.50') 'Personal monthly income expense net';Shot me-overview
 $mg=Run geometry;Check ($mg.rects[2].height -ge 44 -and $mg.rects[3].bottom -le $mg.rects[0].bottom) 'Glass summary includes both sections'
 Run amount|Out-Null;Check ((Run state).amountDialog) 'Original exact purchase amount dialog retained';Run close-amount|Out-Null
 Ide automation_element_action @('--selector','.me-cash-title','--action','tap','--wait-for-selector','.me-cash-title')|Out-Null
 Run wait-route 'pages/statistics/index'|Out-Null;Run settle|Out-Null;$s=Run state
 Check ($s.view -eq 'cash' -and $s.month -eq '2026-10') 'Personal header opens current month cash statistics'
 Check (!$s.analysisError -and $s.analysis.gross -eq '¥3,268.50' -and $s.analysis.expense -eq '¥3,140.50' -and $s.analysis.rows.Count -eq 4) 'Donut gross categories and refund agree';Shot statistics-calendar
 Run bottom|Out-Null;Shot statistics-donut
 Ide automation_element_action @('--selector','.cash-all-categories','--action','tap','--wait-for-selector','.cash-all-categories')|Out-Null
 Check ((Run state).expanded) 'All categories expands within card';Shot categories-expanded
 Ide automation_element_action @('--selector','.cash-report-entry','--action','tap','--wait-for-selector','.cash-report-entry')|Out-Null
 Run wait-route 'pages/ledger-report/index'|Out-Null;Run settle|Out-Null;$s=Run state
 Check (!$s.error -and $s.analysis.net -eq '¥2,859.50') 'Report opens matching refreshed month';Shot report-preview
 $export=Run export;[IO.File]::WriteAllBytes((Join-Path $output 'export-full-native.png'),[Convert]::FromBase64String($export.base64));Check (!$export.masked) 'Native 720px full report exported locally'
 Run mask|Out-Null;$s=Run state;Check (!$s.showAmounts -and $s.analysis.expense -eq '••••' -and @($s.analysis.rows|Where-Object {$_.display -ne '••••'}).Count -eq 0) 'Privacy switch masks totals and category legend';Shot report-hidden
 $export=Run export;[IO.File]::WriteAllBytes((Join-Path $output 'export-hidden-native.png'),[Convert]::FromBase64String($export.base64));Check ($export.masked) 'Native hidden report exported locally'
 Check ((Run state).writes -eq 0) 'No business writes or real shares'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;compiledFiles=$compiled;ledgerGeometry=$lg;meGeometry=$mg;fixtureOnly=$true;remoteWrites=0;realDeviceTested=$false;deployed=$false;uploaded=$false;actualNativeExport=$true} -Depth 20))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 Run restore|Out-Null
 if($original -in @('pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index')){Ide automation_navigate @('--action','switchTab','--url',('/'+$original),'--wait','1')|Out-Null}
 Write-Output 'Original account, storage and transport restored'
}
