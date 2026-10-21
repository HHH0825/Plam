$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/subscription-progress-20261012'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'subscription-progress-native-check.js')).Replace("`r",'').Replace("`n",' ')
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
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null;Run load|Out-Null
 Method sortChange @(@{detail=@{value=4}})
 $list=Run inspect;Check $list.sortIndex 4 'Fifth native sort accepted';Check $list.sortLabel '净成本/天 ↑' 'Ascending capsule label';Check $list.shown[0].name '负成本收藏' 'Negative daily cost is first';Check $list.shown[3].name '暂无成本' 'Missing daily cost is last';Shot ascending '.sort-control'
 Ide automation_navigate @('--action','navigateTo','--url','/pages/item/index?id=990801')|Out-Null;Shot storage '.detail-storage-row';$storage=Run storage-geometry
 Check ([Math]::Abs($storage.rects[0].right-$storage.rects[1].right-12) -lt 1) $true 'Storage change button is 12px from right';Check ($storage.rects[1].width -ge 44 -and $storage.rects[1].height -ge 44) $true 'Storage change touch area at least 44px'
 Run long-storage|Out-Null;Shot storage-long '.detail-storage-row';$long=Run storage-geometry;Check ([Math]::Abs($long.rects[0].right-$long.rects[1].right-12) -lt 1) $true 'Long storage name keeps button on right'
 Tap '.detail-storage-change';Shot storage-picker '.storage-hint';Check (Run inspect).route 'pages/storage-locations/index' 'Change button opens location assignment';Ide automation_navigate @('--action','navigateBack')|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url','/pages/fixed-expenses/index')|Out-Null;Shot subscriptions '.expense-amount';$expenses=Run inspect;$geometry=Run progress-geometry
 Check $expenses.shown.Count 5 'All sample plans display';Check $expenses.shown[0].progress.value '20 天' 'Service remaining days';Check ([Math]::Abs($expenses.shown[0].progress.percent-20/31*100) -lt .01) $true 'Remaining ratio uses service validity';Check $expenses.shown[1].progress.urgent $true 'Three-day service urgent';Check $expenses.shown[2].progress.percent 0 'Expired service empty';Check ($null -eq $expenses.shown[3].progress.percent) $true 'Missing start does not invent percentage'
 Check $geometry.Count 5 'Shared components rendered';Check ([Math]::Abs($geometry[0].rects[0].height-8) -lt 1) $true 'Native track is 8px';Check ($geometry[0].rects[1].width -lt $geometry[0].rects[0].width) $true 'Native fill is shorter than track'
 Method open @(@{currentTarget=@{dataset=@{id=990861}}});Shot subscription-detail '.expense-amount'
 Method beginPay;Check (Run inspect).paying $true 'Payment opens without writing';Method cancelPay;Method edit;Check (Run inspect).editing $true 'Edit opens';Method back
 Method filter @(@{detail=@{value=1}});Check (Run inspect).shown.Count 0 'Paused filter';Method filter @(@{detail=@{value=0}})
 Ide automation_navigate @('--action','navigateTo','--url','/pages/disposed/index')|Out-Null;Method sortChange @(@{detail=@{value=4}});$archive=Run inspect;Check $archive.sortIndex 4 'Archive accepts fifth sort';Shot archive '.sort-control'
 $all=Run inspect;Check (@($all.calls|Where-Object method -ne 'GET').Count) 0 'No write requests made'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;storage=$storage;storageLong=$long;progress=$geometry;list=$list;archive=$archive;remoteWrites=0;fixtureOnly=$true} -Depth 25))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null
 Run restore|Out-Null
 Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];p.onShow();return {fixture:!!getApp()._progressQA,route:p.route};}")|Out-Null
 Write-Output 'Original account and transport restored'
}
