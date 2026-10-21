$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/cover-refinement-20261011'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'cover-refinement-native-check.js')).Replace("`r",'').Replace("`n",' ')
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
 Tap '.icon-choice';Shot picker '.cover-feedback'
 $g=Run geometry;$sheet=$g.rects[0][0];$close=$g.rects[1][0];Check ([Math]::Abs($sheet.right-$close.right-12) -lt 1) $true 'Close is 12px from sheet right';Check ([Math]::Abs($close.top-$sheet.top-12) -lt 1) $true 'Close is 12px from sheet top';Check $close.width 44 'Close width 44px';Check $close.height 44 'Close height 44px';Check ($g.rects[3][0].height -ge 44) $true 'Feedback touch area 44px';Check ($g.rects[2][0].bottom -le $g.window+1) $true 'Footer remains in viewport'
 Method iconSearch @(@{detail=@{value='还没有的物品'}});Check (Run inspect).rows 0 'No-result search';Shot empty '.cover-feedback'
 $returned=Run feedback-return;Check ($returned.before|ConvertTo-Json -Compress) ($returned.after|ConvertTo-Json -Compress) 'Returning preserves search, group, selection and form'
 Method coverKeyboardChange @(@{detail=@{height=300}});$kg=Run geometry;Check ($kg.rects[0][0].height -le $g.window-300) $true 'Keyboard reduces picker height';Check ($kg.rects[2][0].bottom -le $g.window-300+1) $true 'Footer stays above keyboard';Shot keyboard '.cover-feedback'
 Method coverKeyboardChange @(@{detail=@{height=0}});Tap '.cover-close';Check (Run inspect).iconOpen $false 'Close button dismisses picker'
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null;Run load|Out-Null;Shot list '.item-card';$list=Run metrics
 Check ([bool]$list.layouts.'990701') $true 'List has measured layout';Check ($list.layouts.'990702'.kind -ne 'columns') $true 'Large amount moves as a whole';Check $list.layouts.'990706'.kind 'wide' 'Extreme amount uses full card width'
 Tap '#item-990702';Shot detail '.cost-summary';$detail=Run metrics;Check ($detail.layouts.kind -ne 'columns') $true 'Detail uses stacked layout for large amount'
 Ide automation_navigate @('--action','navigateTo','--url','/pages/disposed/index')|Out-Null;Shot archive '.item-card';$archive=Run metrics;Check ([bool]$archive.layouts.'990708') $true 'Disposed archive shares measured layout'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;geometry=$g;keyboard=$kg;list=$list;detail=$detail;archive=$archive;remoteWrites=0;fixtureOnly=$true;feedbackSubmitted=$false} -Depth 25))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 # Leave the editor first so it cannot flush a fixture draft after cleanup.
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null
 Run restore|Out-Null
 Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];p.onShow();return {fixture:!!getApp()._coverQA,route:p.route};}")|Out-Null
 Write-Output 'Original account and transport restored'
}
