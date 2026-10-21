# Independent entry scenarios avoid the existing simulator combined-back timing issue.
param([switch]$DetailOnly)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/items-header-20261012'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'items-header-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
$resultName=if($DetailOnly){'native-detail-results.json'}else{'native-navigation-results.json'}
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$arg=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($arg,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$arg)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null;Write-Output "Screenshot: $name"}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
try{
 $entries=@(@('.wishlist-entry','pages/wishlist/index','wishlist'),@('.subscription-entry','pages/fixed-expenses/index','subscription'),@('.storage-entry','pages/storage-locations/index','storage'),@('#item-991206','pages/item/index','detail'))
 if($DetailOnly){$entries=@();$entries+=,@('#item-991206','pages/item/index','detail')}
 foreach($entry in $entries){
  Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
  try{Run setup|Out-Null;Ide automation_element_action @('--action','tap','--selector',$entry[0],'--wait-for-selector',$entry[0],'--wait','1')|Out-Null;Shot $entry[2];Check (Run inspect).route $entry[1] ('Opens '+$entry[1]);if($entry[1] -eq 'pages/item/index'){Check (Run inspect).detailReady $true 'Detail loaded';Check (Run inspect).error '' 'Detail has no error'};Check (@((Run inspect).calls|Where-Object method -ne 'GET').Count) 0 'No writes'}finally{Run restore|Out-Null}
 }
 if(!$DetailOnly){Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 try{Run setup|Out-Null;Run art-failure|Out-Null;Shot art-failure;Check (Run inspect).heroArtError $true 'Cat fallback active';Run reset-art|Out-Null;Ide automation_navigate @('--action','navigateTo','--url','/pages/disposed/index')|Out-Null;Shot archive;Check (Run inspect).held 1 'Archive count and design preserved'}finally{Run restore|Out-Null}}
 [IO.File]::WriteAllText((Join-Path $output $resultName),(ConvertTo-Json -InputObject @{passed=$true;fixtureOnly=$true;checks=$checks} -Depth 10));Write-Output "Passed $($checks.Count) independent checks"
}catch{[IO.File]::WriteAllText((Join-Path $output $resultName),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 10));throw}finally{Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null}
