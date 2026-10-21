param([switch]$LoginPreviewOnly,[switch]$NavigationOnly)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/theme-refresh-20261014'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'theme-refresh-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$argsFile=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 30));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$argsFile)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($ok,[string]$label){if(!$ok){throw $label};$checks.Add($label);if($NavigationOnly){[IO.File]::WriteAllText((Join-Path $output 'navigation-progress.json'),(ConvertTo-Json -InputObject @{complete=$false;checks=$checks;fixtureOnly=$true} -Depth 20))}}
$original=(Ide automation_runtime_info @('--action','currentPage')).currentPage.path
$fixture=(& node (Join-Path $PSScriptRoot 'cash-redesign-native-fixture.cjs')|Out-String)|ConvertFrom-Json
$monthly=(& node -e "console.log(JSON.stringify(require('./wechat/tests/fixtures/monthly-balance.cjs').find(x=>x.key==='empty').report))"|Out-String)|ConvertFrom-Json
$fixture|Add-Member -NotePropertyName monthly -NotePropertyValue $monthly
$active=$false;$result=$null
try{
 Run restore|Out-Null
 $active=$true;Run setup $fixture|Out-Null
 if($NavigationOnly){
  foreach($route in @('pages/ledger/index','pages/items/index','pages/statistics/index','pages/me/index')){
   Ide automation_navigate @('--action','switchTab','--url',('/'+$route),'--wait','1')|Out-Null
   Run wait-route $route|Out-Null;Run settle|Out-Null
   $nav=Run nav-state;Check ($nav.mounted -and !$nav.hidden -and !$nav.menuOpen -and $nav.selectedRoute -eq $route) ($route+' navigation mounted and visible')
   Run nav-open|Out-Null;$nav=Run nav-state;Check $nav.menuOpen ($route+' add panel opens')
   Run nav-close|Out-Null;Run settle|Out-Null;$nav=Run nav-state;Check (!$nav.menuOpen -and !$nav.hidden) ($route+' navigation returns after close')
   if($route -eq 'pages/items/index'){
    Run filter-open|Out-Null;Check (Run nav-state).hidden 'Item filter hides navigation'
    Run filter-close|Out-Null;Check (!(Run nav-state).hidden) 'Closing item filter restores navigation'
   }
   Shot ('navigation-'+$route.Split('/')[1])
  }
  $state=Run view-state;Check ($state.writes -eq 0) 'Navigation checks made no business writes'
  $result=@{passed=$true;checks=$checks;fixtureOnly=$true;remoteWrites=0;actualNativeScreenshots=$true;realDeviceTested=$false};return
 }
 Ide automation_navigate @('--action','navigateTo','--url','/pages/login/index','--wait','1')|Out-Null
 Run wait-route 'pages/login/index'|Out-Null;Run settle|Out-Null
 $loginGeometry=Run geometry;[IO.File]::WriteAllText((Join-Path $output 'login-geometry-native.json'),(ConvertTo-Json -InputObject $loginGeometry -Depth 20));Check ($loginGeometry.rects[7].height -ge 44) 'Login button retains accessible area';Shot login
 $fail=Run login-fail;Check (!$fail.busy -and $fail.error -and $fail.calls -eq 1) 'Login failure preserves retry';Run bottom|Out-Null;Shot login-error
 if($LoginPreviewOnly){$result=@{passed=$true;checks=$checks;loginGeometry=$loginGeometry;fixtureOnly=$true;remoteWrites=0;actualNativeScreenshots=$true;finalHeroCapture=$true;realDeviceTested=$false};return}
 $double=Run login-double;Check ($double.calls -eq 1 -and !$double.busy) 'Concurrent login submits only once';Run wait-route 'pages/items/index'|Out-Null
 Run guest-session|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url','/pages/login/index','--wait','1')|Out-Null
 Run wait-route 'pages/login/index'|Out-Null;Run existing-session|Out-Null
 Run wait-route 'pages/items/index'|Out-Null;$checks.Add('Existing session redirects to items')
 Run guest-session|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/statistics/index','--wait','1')|Out-Null
 Run wait-view 'cash'|Out-Null;$cash=Run view-state;$cashGeometry=Run geometry;[IO.File]::WriteAllText((Join-Path $output 'switch-geometry-native.json'),(ConvertTo-Json -InputObject $cashGeometry -Depth 20));Shot statistics-cash;Check ($cashGeometry.rects[0].width -le 340.1 -and $cashGeometry.rects[1].height -ge 44) 'Cream switch fits and buttons remain accessible'
 Ide automation_element_action @('--selector','#statistics-view-items','--action','tap','--wait-for-selector','#statistics-view-items')|Out-Null
 Run wait-view 'items'|Out-Null;$items=Run view-state;Check ($items.view -eq 'items') 'Items view opens';Shot statistics-items
 Ide automation_element_action @('--selector','#statistics-view-cash','--action','tap','--wait-for-selector','#statistics-view-cash')|Out-Null
 Run wait-view 'cash'|Out-Null;$back=Run view-state;Check ($back.month -eq $cash.month -and $back.selectedDate -eq $cash.selectedDate) 'Cash month and selected day survive view switching'
 Ide automation_navigate @('--action','navigateTo','--url','/pages/insights/index','--wait','1')|Out-Null
 Run wait-route 'pages/insights/index'|Out-Null;Run settle|Out-Null;Shot insights
 Ide automation_navigate @('--action','navigateTo','--url','/pages/editor/index','--wait','1')|Out-Null
 Run wait-route 'pages/editor/index'|Out-Null;Run settle|Out-Null;Shot editor
 Ide automation_navigate @('--action','navigateTo','--url','/pages/monthly/index?month=2026-10','--wait','1')|Out-Null
 Run wait-route 'pages/monthly/index'|Out-Null;Run settle|Out-Null;Shot monthly
 Ide automation_navigate @('--action','navigateTo','--url','/pages/login/index','--wait','1')|Out-Null
 Run wait-route 'pages/login/index'|Out-Null;Run asset-errors|Out-Null;Shot login-fallback
 $state=Run view-state;Check ($state.writes -eq 0) 'No business writes or real login requests'
 $result=@{passed=$true;checks=$checks;loginGeometry=$loginGeometry;cashGeometry=$cashGeometry;fixtureOnly=$true;remoteWrites=0;actualNativeScreenshots=$true;realDeviceTested=$false;deployed=$false;uploaded=$false}
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 $restored=$false
 if($active){try{Run restore|Out-Null;$restored=$true}catch{Write-Warning 'Native fixture restore could not be confirmed'}}
 if($restored){if($original -in @('pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index')){Ide automation_navigate @('--action','switchTab','--url',('/'+$original),'--wait','1')|Out-Null}else{Ide automation_navigate @('--action','redirectTo','--url',('/'+$original),'--wait','1')|Out-Null}}
 [IO.File]::WriteAllText((Join-Path $output 'partial-native-results.json'),(ConvertTo-Json -InputObject @{checks=$checks;restoreConfirmed=$restored} -Depth 20))
 if($result){$result.restoreConfirmed=$restored;[IO.File]::WriteAllText((Join-Path $output $(if($NavigationOnly){'native-results-navigation.json'}elseif($LoginPreviewOnly){'native-results-login-final.json'}else{'native-results.json'})),(ConvertTo-Json -InputObject $result -Depth 25))}
 if($restored){Write-Output 'Original account, session functions, storage and transport restored'}
}
