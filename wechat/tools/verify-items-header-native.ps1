$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/items-header-20261012'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'items-header-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$arg=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($arg,(ConvertTo-Json -InputObject @($action,$value) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$arg)).result.result}
function Tap([string]$selector){Ide automation_element_action @('--action','tap','--selector',$selector,'--wait-for-selector',$selector)|Out-Null}
function WaitRoute([string]$route){Run wait-route $route|Out-Null}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
function Shot([string]$name,[string]$selector='.held-count'){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1','--wait-for-selector',$selector)|Out-Null;Write-Output "Screenshot: $name"}
try{
 Run setup|Out-Null;Shot items
 $state=Run inspect;Check $state.held 6 'Held count excludes disposed';Check $state.shown 6 'Held list loaded';Check $state.heroArtError $false 'Cat PNG loaded'
 $g=Run geometry;$r=$g.rects
 Check ($r[2].left -ge $r[1].right-1) $true 'Cat does not overlap text'
 Check ([Math]::Abs($r[4].left-$r[0].left) -lt 1) $true 'Search and header aligned'
 Check ($r[5].height -ge 44 -and $r[6].height -ge 44 -and $r[7].height -ge 44) $true 'Entry touch targets'
 Check ([Math]::Abs($r[5].width-$r[7].width) -lt 1) $true 'Entry widths equal'
 $keyword=-join [char[]]@(0x9A6C,0x514B,0x676F)
 Ide automation_element_action @('--action','input','--selector','.search','--value',$keyword)|Out-Null
 $s=Run inspect;Check $s.held 6 'Search preserves header total';Check $s.shown 2 'Search narrows results';Shot search
 Tap '.clear-filter';Tap '.filter-control';Shot filter '.filter-sheet';Tap '.filter-choice[data-index="1"]';Tap '.sheet-apply'
 $s=Run inspect;Check $s.held 6 'Status filter preserves header total';Check $s.shown 3 'Status filter applied';Tap '.clear-filter';Run sort|Out-Null;Check (Run inspect).sort 4 'Ascending sort retained'
 foreach($entry in @(@('.wishlist-entry','pages/wishlist/index'),@('.subscription-entry','pages/fixed-expenses/index'),@('.storage-entry','pages/storage-locations/index'))){Tap $entry[0];WaitRoute $entry[1];Check (Run inspect).route $entry[1] ('Entry navigation '+$entry[0]);Ide automation_navigate @('--action','navigateBack')|Out-Null;WaitRoute 'pages/items/index'}
 Tap '#item-991206';WaitRoute 'pages/item/index';Check (Run inspect).route 'pages/item/index' 'Item detail navigation';Ide automation_navigate @('--action','navigateBack')|Out-Null;WaitRoute 'pages/items/index';Check (Run inspect).held 6 'Detail return restores collection'
 Run art-failure|Out-Null;Shot art-failure;Run reset-art|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url','/pages/disposed/index')|Out-Null;WaitRoute 'pages/disposed/index';Shot archive '.archive-page';Check (Run inspect).held 1 'Archive stays separate';Ide automation_navigate @('--action','navigateBack')|Out-Null;WaitRoute 'pages/items/index'
 $s=Run inspect;Check (@($s.calls|Where-Object method -ne 'GET').Count) 0 'No backend mutations'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;fixtureOnly=$true;checks=$checks;geometry=$g} -Depth 20));Write-Output "Passed $($checks.Count) native checks"
}catch{[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 12));throw}finally{Run restore|Out-Null}
