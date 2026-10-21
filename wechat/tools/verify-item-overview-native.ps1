param([switch]$BottomOnly)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/item-overview-20261014'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'item-overview-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$argsFile=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 30));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$argsFile)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$label){if(!$condition){throw $label};$checks.Add($label)}
$original=(Ide automation_evaluate @('--fn-source','function(){return getCurrentPages().slice(-1)[0].route}')).result.result
$fixture=(& node (Join-Path $PSScriptRoot 'item-overview-native-fixture.cjs')|Out-String)|ConvertFrom-Json
if($BottomOnly){
 try{
  Run setup $fixture|Out-Null
  Ide automation_navigate @('--action','switchTab','--url','/pages/statistics/index','--wait','1')|Out-Null
  Run reload|Out-Null;Run view items|Out-Null;Run settle|Out-Null
  Run bottom|Out-Null;Shot statistics-bottom
 }finally{
  Run restore|Out-Null
  if($original -in @('pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index')){Ide automation_navigate @('--action','switchTab','--url',('/'+$original),'--wait','1')|Out-Null}
 }
 exit
}
$compiled=0
foreach($name in @('items','statistics','insights','disposed')){foreach($ext in @('wxml','wxss')){Ide ('compile_'+$ext) @('--file-path',"pages/$name/index.$ext")|Out-Null;$compiled++}}
try{
 Run setup $fixture|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 Run reload|Out-Null;Run settle|Out-Null
 $s=Run state;Check ($s.items -eq 6 -and !$s.searchOpen) 'Held count and initial collapsed search';Shot items-collapsed
 $g=Run geometry;Check ($null -eq $g.rects[6] -and $null -eq $g.rects[7]) 'No separate search row or duplicate result count'
 Check ([Math]::Abs($g.rects[1].left-$g.rects[0].left) -lt 2) 'Search is left aligned'
 Check (@($g.rects[1,4,5]|Where-Object {$_.width -lt 44 -or $_.height -lt 44}).Count -eq 0) 'Toolbar targets at least 44px'
 Run search|Out-Null;Run settle|Out-Null;$s=Run state;Check ($s.searchOpen -and $s.query -eq '马克杯' -and $s.shown -eq 3) 'Inline search filters held records';Shot items-expanded
 $eg=Run geometry;Check ($null -ne $eg.rects[3] -and $eg.rects[2].right -le $eg.rects[4].left -and [Math]::Abs($eg.rects[5].width-44) -lt 1) 'Expanded search keeps filter and icon sort visible'
 Check ([Math]::Abs(($eg.rects[1].top+$eg.rects[1].bottom)-($eg.rects[4].top+$eg.rects[4].bottom)) -lt 4) 'Expanded controls share one row'
 Run clear|Out-Null;Check ((Run state).searchOpen -and (Run state).shown -eq 6) 'Input clear keeps search expanded'
 Run collapse|Out-Null;Run search|Out-Null;Run collapse|Out-Null;Check (!(Run state).searchOpen -and (Run state).query -eq '马克杯') 'Collapse retains query';Shot items-query-chip
 Run clear|Out-Null;Run cancel-filter|Out-Null;Check ((Run state).filterCount -eq 0 -and (Run state).shown -eq 6) 'Clear and filter cancel preserve state'
 Run sort|Out-Null;Check ((Run state).sortIndex -eq 4) 'Sorting still works'
 Ide automation_navigate @('--action','switchTab','--url','/pages/statistics/index','--wait','1')|Out-Null
 Run view items|Out-Null;Run settle|Out-Null;$s=Run state
 Check ($s.view -eq 'items' -and $s.itemStats.netText -eq '17,279.90' -and !$s.itemStatsError -and !$s.itemInsightsError) 'Items statistics works with ledger capability disabled';Shot statistics-overview
 Check ($s.itemStats.breakdown[2].text -eq '30.00' -and $s.itemStats.distribution.rows.Count -eq 3 -and $s.itemStats.states[2].text -eq '2') 'Costs states and categories match fixture'
 Check (($s.itemReminders -join ',') -eq 'manual_idle,warranty_due') 'Reminder priority matches existing analysis'
 Run bottom|Out-Null;Shot statistics-bottom
 $dg=Run dashboard-geometry;Check ($null -ne $dg.rects[0] -and $dg.rects[2].width -ge 44 -and $dg.rects[3].height -ge 44) 'Dashboard and information reminder targets rendered'
 Ide automation_element_action @('--selector','.item-dashboard-reminder','--action','tap','--wait-for-selector','.item-dashboard-reminder')|Out-Null
 Run wait-route 'pages/insights/index'|Out-Null;Run settle|Out-Null;$s=Run state
 Check ($s.targetKind -eq 'manual_idle' -and !$s.anchorPending) 'Reminder opens and locates matching insight';Shot reminder-target
 Ide automation_navigate @('--action','switchTab','--url','/pages/statistics/index','--wait','1')|Out-Null;Run settle|Out-Null
 Check ((Run state).view -eq 'items') 'Returning retains items view'
 Ide automation_element_action @('--selector','.item-dashboard-report','--action','tap','--wait-for-selector','.item-dashboard-report')|Out-Null
 Run wait-route 'pages/monthly/index'|Out-Null;Check ((Run state).route -eq 'pages/monthly/index') 'Monthly report entry opens existing page'
 Ide automation_navigate @('--action','switchTab','--url','/pages/statistics/index','--wait','1')|Out-Null;Run settle|Out-Null
 Run view cash|Out-Null;Run settle|Out-Null;Run view items|Out-Null;Run settle|Out-Null
 $s=Run state;Check ($s.itemStats.netText -eq '17,279.90' -and $s.writes -eq 0) 'Switching from unsupported cash view still loads items without writes'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;compiledFiles=$compiled;collapsedGeometry=$g;expandedGeometry=$eg;dashboardGeometry=$dg;fixtureOnly=$true;remoteWrites=0;realDeviceTested=$false;deployed=$false;uploaded=$false} -Depth 20))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 Run restore|Out-Null
 if($original -in @('pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index')){Ide automation_navigate @('--action','switchTab','--url',('/'+$original),'--wait','1')|Out-Null}
 Write-Output 'Original account, storage and transport restored'
}
