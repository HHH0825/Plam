param([switch]$TailOnly)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/summary-amount-20261012'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'summary-amount-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
$resultName=if($TailOnly){'native-tail-results.json'}else{'native-results.json'}
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$result=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$result.ok -or !$result.result.success){throw $raw};return $result.result}
function ArgsFile($values){$file=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $values -Depth 25 -Compress));return $file}
function Run([string]$action,$value=$null){return (Ide automation_evaluate @('--fn-source',$source,'--args-file',(ArgsFile @($action,$value)))).result.result}
function Method([string]$name){Ide automation_page_action @('--action','callMethod','--method',$name)|Out-Null}
function Tap([string]$selector){Ide automation_element_action @('--action','tap','--selector',$selector,'--wait-for-selector',$selector)|Out-Null}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
function WaitRoute([string]$expected){for($attempt=0;$attempt -lt 3;$attempt++){if((Run inspect).route -eq $expected){return}};throw "Page did not become $expected"}
function ReturnMe{Ide automation_navigate @('--action','navigateBack','--delta','1')|Out-Null;if((Run inspect).route -ne 'pages/me/index'){Ide automation_navigate @('--action','switchTab','--url','/pages/me/index')|Out-Null;$checks.Add('Simulator navigateBack required switchTab fallback; native back gesture remains unverified')};WaitRoute 'pages/me/index'}
function Shot([string]$name,[string]$selector){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1','--wait-for-selector',$selector)|Out-Null;Write-Output "Screenshot: $name"}
try{
 Run setup|Out-Null
 if(!$TailOnly){
 Ide automation_navigate @('--action','navigateTo','--url','/pages/insights/index')|Out-Null
 Run net '13547.00'|Out-Null;Run scroll '.monthly-brief'|Out-Null;Shot preview '.brief-balance-value';$normal=Run geometry
 Check ($normal.rects[3].width -le $normal.rects[2].width+1) $true 'Preview 13547.00 fits one line';Check ((Run inspect).monthlyLayout.kind) 'columns' 'Preview normal uses columns'
 Run net '999999999999999999.99'|Out-Null;$large=Run inspect;Check $large.monthlyLayout.kind 'stacked' 'Large preview switches to full width';Shot preview-large '.brief-balance-value'
 Run net '999999999999999999999999.99'|Out-Null;Check ((Run inspect).monthlyLayout.scroll) $true 'Extreme preview enables amount-only scrolling';Shot preview-extreme '.brief-balance-value'
 Ide automation_navigate @('--action','switchTab','--url','/pages/me/index')|Out-Null
 Run amount '17551.90'|Out-Null;$me=Run inspect;$geometry=Run geometry
 Check $me.display '约 ¥1.76万' 'Me abbreviation';Check $me.amount '17,551.90' 'Me exact amount retained';Check ($geometry.rects[1].height -ge 44) $true 'Amount touch area at least 44px';Shot me '.profile-divider'
 Tap '.amount-cell';$modal=Run inspect;Check $modal.amountDialog $true 'Amount tap opens exact amount dialog';Check $modal.barHidden $true 'Dialog hides bottom navigation';Shot amount-dialog '.amount-dialog';Tap '.amount-dialog-close';Check ((Run inspect).amountDialog) $false 'Dialog closes';Check ((Run inspect).barHidden) $false 'Closing restores navigation'
 Run amount '99999950.00'|Out-Null;Check ((Run inspect).display) '约 ¥1.00亿' 'Rounding promotes wan to yi'
 Run amount '999999999999999999999999999999999999.99'|Out-Null;Check ((Run inspect).amountLayout.scroll) $true 'Extreme Me amount remains horizontally accessible';Check ((Run inspect).amountLayout.kind) 'stacked' 'Extreme Me amount owns full row';Shot me-extreme '.overview-card'
 Run mode error|Out-Null;Method amountInfo;$failed=Run inspect;Check $failed.amountDialog $false 'Failure cannot open old amount';Check $failed.display '—' 'Failure clears amount display';Shot stats-error '.overview-error'
 Run mode normal|Out-Null;Run amount '17551.90'|Out-Null;Check ((Run inspect).error) '' 'Retry clears old error'
 Run scroll '.profile-center'|Out-Null;Tap '.profile-hero';WaitRoute 'pages/profile/index';Check ((Run inspect).route) 'pages/profile/index' 'Avatar opens settings';ReturnMe
 }else{
 Ide automation_navigate @('--action','switchTab','--url','/pages/me/index')|Out-Null
 Run amount '17551.90'|Out-Null
 }
 Run scroll '.logout-button'|Out-Null;Shot footer '.logout-button'
 Run mode legacy|Out-Null;Method amountInfo;Check ((Run inspect).amountDialog) $false 'Legacy response cannot open viewer';Check ((Run inspect).display) '—' 'Legacy response does not invent zero'
 $switched=Run account-switch;Check ($switched.amount -eq '—' -and $switched.display -eq '—' -and !$switched.amountDialog) $true 'Account switch clears all amounts and dialog'
 if($TailOnly){Run reset-account|Out-Null;Run scroll '#menu-settings'|Out-Null;Tap '#menu-settings';WaitRoute 'pages/profile/index';Check ((Run inspect).route) 'pages/profile/index' 'Bottom settings entry works'}
 $all=Run inspect;Check (@($all.calls|Where-Object method -ne 'GET').Count) 0 'No write requests'
 [IO.File]::WriteAllText((Join-Path $output $resultName),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;normal=$normal;overview=$geometry;fixtureOnly=$true;remoteWrites=0} -Depth 25));Write-Output "Passed $($checks.Count) native checks"
}catch{
 [IO.File]::WriteAllText((Join-Path $output $resultName),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message;fixtureOnly=$true;remoteWrites=0} -Depth 25));throw
}finally{
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null
 Run restore|Out-Null
 Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];p.onShow();return {fixture:!!getApp()._summaryAmountQA,route:p.route};}")|Out-Null
 Write-Output 'Original account and transport restored'
}
