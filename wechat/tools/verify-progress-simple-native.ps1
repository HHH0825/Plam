$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/subscription-progress-simple-20261012'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'subscription-progress-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function ArgsFile($value){$file=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $value -Depth 12 -Compress));return $file}
function Run([string]$action){return (Ide automation_evaluate @('--fn-source',$source,'--args-file',(ArgsFile @($action)))).result.result}
function Eval([string]$js){return (Ide automation_evaluate @('--fn-source',$js.Replace('"',"'"))).result.result}
function Method([string]$name,$value=@()){Ide automation_page_action @('--action','callMethod','--method',$name,'--args-file',(ArgsFile $value))|Out-Null}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1','--wait-for-selector','.expense-time-progress')|Out-Null;Write-Output "Screenshot: $name"}
function Check($value,[string]$label){if(!$value){throw $label};$checks.Add($label)}
try{
 Run setup|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url','/pages/fixed-expenses/index','--wait','1')|Out-Null
 $g=Run progress-geometry;$s=Run inspect
 Check ($g.Count -eq 5) 'Five native progress components rendered'
 Check ($s.shown[0].progress.value -eq '20 天') 'Service days unchanged'
 Check ([Math]::Abs($g[0].rects[0].height-8) -lt 1) 'Track height is 8px'
 Check ($g[0].rects[2].width -eq 16 -and $g[0].rects[2].bottom -lt $g[0].rects[0].top) 'Paw is 16px and outside track'
 Check ([Math]::Abs($g[0].rects[1].width/$g[0].rects[0].width-20/31) -lt .01) 'Remaining time fill unchanged'
 $c=Eval 'function(){const p=getCurrentPages().slice(-1)[0],c=p.selectAllComponents(".expense-time-progress")[0];return {number:c.data.dayNumber,numeric:c.data.isDayCount};}'
 Check ($c.numeric -and $c.number -eq '20') 'Native observer separates day number and unit'
 Shot subscriptions
 Ide automation_element_action @('--action','tap','--selector','.expense-time-progress','--wait-for-selector','.expense-time-progress')|Out-Null
 $s=Run inspect;Check ($s.selected.id -eq 990861) 'Progress area keeps card detail navigation'
 Shot subscription-detail
 Method beginPay;Check (Run inspect).paying 'Payment form opens without submitting';Method cancelPay
 Method edit;Check (Run inspect).editing 'Edit form opens without submitting';Method back
 Method back;Check (!(Run inspect).selected) 'Detail returns to list'
 Method open @(@{currentTarget=@{dataset=@{id=990862}}});$c=Eval 'function(){return getCurrentPages().slice(-1)[0].selectAllComponents(".expense-time-progress")[0].data;}'
 Check ($c.dayNumber -eq '3' -and $c.progress.urgent) 'Same component updates to urgent three days';Shot urgent
 Method back;Method open @(@{currentTarget=@{dataset=@{id=990863}}});$c=Eval 'function(){return getCurrentPages().slice(-1)[0].selectAllComponents(".expense-time-progress")[0].data;}'
 Check (!$c.isDayCount -and $c.dayNumber -eq '' -and $c.progress.percent -eq 0) 'Expired state clears stale day digits';Shot expired
 $fallback=Eval 'function(){const p=getCurrentPages().slice(-1)[0],c=p.selectAllComponents(".expense-time-progress")[0];c.pawFailed();return {hidden:c.data.pawFailed,value:c.data.progress.value};}'
 Check ($fallback.hidden -and $fallback.value -eq '已过期 2 天') 'Paw failure leaves true status intact'
 $s=Run inspect;Check (@($s.calls|Where-Object method -ne 'GET').Count -eq 0) 'No backend write requests'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;geometry=$g;fixtureOnly=$true;remoteWrites=0} -Depth 15))
 Write-Output "Passed $($checks.Count) native checks"
}catch{[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 12));throw}finally{
 Run restore|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 Write-Output 'Original account and transport restored'
}
