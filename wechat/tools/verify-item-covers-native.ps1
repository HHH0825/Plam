$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/item-covers-20261011'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'item-covers-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$result=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$result.ok -or !$result.result.success){throw $raw};return $result.result}
function ArgsFile($values){$file=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $values -Depth 20 -Compress));return $file}
function Run([string]$action){return (Ide automation_evaluate @('--fn-source',$source,'--args-file',(ArgsFile @($action)))).result.result}
function Method([string]$name,$values=@()){Ide automation_page_action @('--action','callMethod','--method',$name,'--args-file',(ArgsFile $values))|Out-Null}
function Tap([string]$selector){Ide automation_element_action @('--action','tap','--selector',$selector,'--wait-for-selector',$selector)|Out-Null}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
function Shot([string]$name,[string]$selector){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1','--wait-for-selector',$selector)|Out-Null;Write-Output "Screenshot: $name"}
try{
 Run setup|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url','/pages/editor/index')|Out-Null
 Check (Run inspect).coverSupported $true 'Backend capability enables icon picker'
 Tap '.icon-choice';Check (Run inspect).rows 40 'Picker opens all forty icons';Shot picker '.cover-sheet-footer'
 $measure=Run measure;[IO.File]::WriteAllText((Join-Path $output 'native-geometry.json'),($measure|ConvertTo-Json -Depth 20));Check ($measure.rects[1][0].bottom -le ($measure.window + 1)) $true 'Confirm stays within viewport';Check (($measure.rects[2]|Where-Object {$_.height -lt 44 -or $_.width -lt 44}).Count) 0 'Grid touch areas at least 44px'
 Method iconSearch @(@{detail=@{value='手机'}});Check (Run inspect).rows 1 'Search finds phone'
 Tap '.cover-option';Tap '.cover-sheet-footer .button';Check (Run inspect).form.cover_icon_key 'phone' 'Confirm changes preview only';Check (Run inspect).writes.Count 0 'Selection does not write to backend'
 Run fill|Out-Null;Shot editor '.cover-choices';Method save
 $state=Run inspect;Check $state.writes.Count 1 'Save creates one isolated item';Check $state.writes[0].data.cover_icon_key 'phone' 'Save carries stable cover ID'
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null;Run load|Out-Null;Shot list '.item-card'
 Tap '#item-990701';Shot detail '.detail-hero'
 Ide automation_navigate @('--action','navigateTo','--url','/pages/editor/index?id=990701')|Out-Null;Run unavailable|Out-Null;Check (Run inspect).coverSupported $false 'Old backend disables icon saving';Shot unavailable '.cover-choices'
 Run supported|Out-Null;Tap '.icon-choice';Method iconGroupChange @(@{currentTarget=@{dataset=@{key='daily'}}});Check (Run inspect).rows 6 'Group shows daily-use icons';Tap '.cover-close';Check (Run inspect).iconOpen $false 'Cancel closes without saving'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;geometry=$measure;remoteWrites=0;fixtureOnly=$true} -Depth 20))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 # Leave the editor first so it cannot flush a fixture draft after cleanup.
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null
 Run restore|Out-Null
 Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];p.onShow();return {fixture:!!getApp()._coverQA,route:p.route};}")|Out-Null
 Write-Output 'Original account and transport restored'
}
