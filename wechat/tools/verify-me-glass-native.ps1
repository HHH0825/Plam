$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/me-glass-20261012'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'me-glass-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$result=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$result.ok -or !$result.result.success){throw $raw};return $result.result}
function Run([string]$action,$value=$null){$arg=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($arg,(ConvertTo-Json -InputObject @($action,$value) -Depth 20 -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$arg)).result.result}
function Tap([string]$selector){Ide automation_element_action @('--action','tap','--selector',$selector,'--wait-for-selector',$selector)|Out-Null}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
function Shot([string]$name,[string]$selector='.overview-card'){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1','--wait-for-selector',$selector)|Out-Null;Write-Output "Screenshot: $name"}
try{
 Run setup|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/me/index')|Out-Null
 Run amount '17551.90'|Out-Null;Run glass on|Out-Null;$normal=Run measure;Shot me
 $r=$normal.rects
 Check ($null -eq $r[11]) $true 'Divider removed'
 Check ([Math]::Abs($r[1].width-$normal.window.windowWidth) -le 1) $true 'Cream wash spans viewport'
 Check ($r[1].bottom -ge $r[0].bottom) $true 'Cream wash follows profile content'
 Check ($r[4].bottom -le $r[3].top+2) $true 'Ornaments stay above username'
 Check ($r[7].height -ge 44) $true 'Amount touch area remains accessible'
 Check ($r[8].top-$r[9].bottom -le 24) $true 'Compact section gap restored'
 Run glass off|Out-Null;Shot glass-off
 Run glass fallback|Out-Null;Shot glass-fallback
 Run glass probe-on|Out-Null;Shot glass-probe-on
 Run glass probe-off|Out-Null;Shot glass-probe-off
 Run glass probe-fallback|Out-Null;Shot glass-probe-fallback
 Run glass on|Out-Null
 Tap '.amount-cell';Check ((Run inspect).amountDialog) $true 'Amount dialog opens';Shot amount-dialog '.amount-dialog';Tap '.amount-dialog-close';Check ((Run inspect).barHidden) $false 'Amount dialog restores navigation'
 Run long-name|Out-Null;$long=Run measure;Check ($long.rects[4].bottom -le $long.rects[3].top+2) $true 'Long username avoids ornaments';Shot long-name
 Run profile-error|Out-Null;Run mode error|Out-Null;$errorGeometry=Run measure;Check ($errorGeometry.rects[1].bottom -ge $errorGeometry.rects[0].bottom) $true 'Error prompts extend cream backdrop';Shot error '.overview-error'
 Run mode normal|Out-Null;Check ((Run inspect).error) '' 'Stats retry works'
 Run mode legacy|Out-Null;Ide automation_page_action @('--action','callMethod','--method','amountInfo')|Out-Null;Check ((Run inspect).amountDialog) $false 'Old backend cannot open amount viewer'
 Run scroll '.logout-button'|Out-Null;Shot footer '.logout-button';$footer=Run measure;Check ($footer.rects[10].height -ge 48) $true 'Logout keeps touch height'
 $switched=Run account-switch;Check ($switched.amount -eq '—' -and $switched.display -eq '—') $true 'Account switch clears amounts'
 Run reset-account|Out-Null;Run scroll '#menu-settings'|Out-Null;Tap '#menu-settings';Check ((Run inspect).route) 'pages/profile/index' 'Personal settings entry works'
 $all=Run inspect;Check (@($all.calls|Where-Object method -ne 'GET').Count) 0 'No write requests'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;normal=$normal;long=$long;error=$errorGeometry;fixtureOnly=$true;remoteWrites=0} -Depth 25));Write-Output "Passed $($checks.Count) native checks"
}catch{
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message;fixtureOnly=$true} -Depth 25));throw
}finally{
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null
 Run restore|Out-Null
 Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];p.getTabBar()?.setData({hidden:false});p.onShow();return {fixture:!!getApp()._summaryAmountQA,route:p.route};}")|Out-Null
 Write-Output 'Original account and transport restored'
}
