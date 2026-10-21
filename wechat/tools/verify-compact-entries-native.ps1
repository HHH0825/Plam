$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/compact-entries-20261012'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'items-header-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$arg=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($arg,(ConvertTo-Json -InputObject @($action,$value) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$arg)).result.result}
function Tap([string]$selector){Ide automation_element_action @('--action','tap','--selector',$selector,'--wait-for-selector',$selector,'--wait','1')|Out-Null}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($value,[string]$label){if(!$value){throw $label};$checks.Add($label)}
try{
 $geometry=$null
 foreach($entry in @(@('.wishlist-entry','pages/wishlist/index'),@('.subscription-entry','pages/fixed-expenses/index'),@('.storage-entry','pages/storage-locations/index'))){
  Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
  try{
   Run setup|Out-Null
   if(!$geometry){
    $geometry=Run geometry;$buttons=$geometry.rects[5..7];$target=if($geometry.window.windowWidth -le 350){68}else{70}
    Check (@($buttons|Where-Object {[Math]::Abs($_.height-$target) -gt 1}).Count -eq 0) 'Native entry height matches 68/70px target'
    Check ([Math]::Abs($buttons[0].width-$buttons[2].width) -lt 1 -and [Math]::Abs($buttons[0].height-$buttons[2].height) -lt 1) 'Three buttons equal width and height'
    Shot items
   }
   Tap $entry[0];Run wait-route $entry[1]|Out-Null;$s=Run inspect
   Check ($s.route -eq $entry[1]) ('Opens '+$entry[1])
   Check (@($s.calls|Where-Object method -ne 'GET').Count -eq 0) 'No backend writes'
  }finally{Run restore|Out-Null}
 }
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 try{
  Run setup|Out-Null;Tap '.filter-control';Shot filter;Tap '.filter-choice[data-index="1"]';Tap '.sheet-apply'
  Check ((Run inspect).shown -eq 3) 'Filter remains operable';Tap '.clear-filter'
  Run sort|Out-Null;Check ((Run inspect).sort -eq 4) 'Sort callback remains operable'
 }finally{Run restore|Out-Null}
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;geometry=$geometry;fixtureOnly=$true} -Depth 16));Write-Output "Passed $($checks.Count) native checks"
}catch{[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 12));throw}finally{Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null}
