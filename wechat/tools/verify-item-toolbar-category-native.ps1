$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/item-toolbar-category-20261014'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'item-toolbar-category-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$argsFile=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @($action,$value) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$argsFile)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$label){if(!$condition){throw $label};$checks.Add($label)}
$original=(Ide automation_evaluate @('--fn-source','function(){return getCurrentPages().slice(-1)[0].route}')).result.result
$compiled=0
foreach($name in @('items','disposed','editor')){foreach($ext in @('wxml','wxss')){Ide ('compile_'+$ext) @('--file-path',"pages/$name/index.$ext")|Out-Null;$compiled++}}
try{
 Run setup|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 Run reload|Out-Null
 $s=Run state;Check ($s.items -eq 6 -and !$s.searchOpen) 'Held count preserved and search initially collapsed';Shot items
 $g=Run geometry;Check ($null -eq $g.rects[5] -and $null -eq $g.rects[6]) 'No permanent search box or duplicate result count'
 Check ($g.rects[1].top -ge $g.rects[0].bottom) 'Toolbar below three entrances'
 Check (@($g.rects[2..4]|Where-Object {$_.width -lt 44 -or $_.height -lt 44}).Count -eq 0) 'Three controls retain 44px targets'
 Run search|Out-Null;$s=Run state;Check ($s.searchOpen -and $s.query -eq '马克杯' -and $s.shown -eq 2) 'Search expands and filters held records';Shot search
 Run collapse|Out-Null;Check (!(Run state).searchOpen -and (Run state).query -eq '马克杯') 'Collapsed search retains query';Shot chip
 Run clear|Out-Null;Run cancel-filter|Out-Null;Check ((Run state).shown -eq 6 -and (Run state).filterCount -eq 0) 'Clear search and cancel filter preserve conditions'
 Run sort|Out-Null;Check ((Run state).sortIndex -eq 4) 'Ascending cost sort remains available'
 foreach($entry in @(@('.wishlist-entry','pages/wishlist/index'),@('.subscription-entry','pages/fixed-expenses/index'),@('.storage-entry','pages/storage-locations/index'))){
  Ide automation_element_action @('--selector',$entry[0],'--action','tap','--wait-for-selector',$entry[0])|Out-Null
  Run wait-route $entry[1]|Out-Null
  Check ((Run state).route -eq $entry[1]) ('Entrance opens '+$entry[1])
  Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
  Run wait-route 'pages/items/index'|Out-Null
 }
 Ide automation_navigate @('--action','navigateTo','--url','/pages/editor/index?id=991201','--wait','1')|Out-Null
 $s=Run state;Check ($s.category -eq '数码' -and $s.originalCategory -eq '摄影器材') 'Old custom category normalized only in the form';Shot editor
 $eg=Run editor-geometry;Check ($eg.freeInputs.Count -eq 0) 'Free category input removed'
 Run category|Out-Null;$s=Run state;Check ($s.category -eq '家居' -and $s.type -eq 'home') 'Category selector synchronizes both legacy fields'
 Check ($s.writes -eq 0) 'No business writes attempted'
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null;Run wait-route 'pages/items/index'|Out-Null
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;compiledFiles=$compiled;geometry=$g;fixtureOnly=$true;remoteWrites=0;realDeviceTested=$false;deployed=$false;uploaded=$false} -Depth 15))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 Run restore|Out-Null
 if($original -in @('pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index')){Ide automation_navigate @('--action','switchTab','--url',('/'+$original),'--wait','1')|Out-Null}
 Write-Output 'Original account, storage and transport restored'
}
