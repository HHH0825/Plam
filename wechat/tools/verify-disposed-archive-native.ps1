param([switch]$TransitionsOnly)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/disposed-archive-20261011'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'disposed-archive-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new();$evidence=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$result=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$result.ok -or !$result.result.success){throw $raw};return $result.result}
function Eval([string]$code){return (Ide automation_evaluate @('--fn-source',$code)).result.result}
function Run([string]$action){$arg=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($arg,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$arg)).result.result}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
function WaitRoute([string]$route){$result=Eval "function(){return new Promise(resolve=>{let n=0;const check=()=>{const p=getCurrentPages().slice(-1)[0];if(p.route==='$route'||n++>40)resolve(p.route);else setTimeout(check,100);};check();});}";Check $result $route "Reached $route"}
function Nav([string]$action,[string]$url){
 if($url.Contains('&')){$argsPath=Join-Path $output 'native-route-args.json';[IO.File]::WriteAllText($argsPath,(ConvertTo-Json -InputObject @($action,$url) -Compress));$navSource='function(action,url){return new Promise(resolve=>wx[action]({url,success:()=>resolve(true),fail:r=>resolve(r)}));}';Ide automation_evaluate @('--fn-source',$navSource,'--args-file',$argsPath)|Out-Null}
 else{Ide automation_navigate @('--action',$action,'--url',$url)|Out-Null}
 WaitRoute $url.Split('?')[0].TrimStart('/');Run load
}
function Tap([string]$selector){Ide automation_element_action @('--action','tap','--selector',$selector,'--wait-for-selector',$selector)|Out-Null}
function Shot([string]$name,[string]$selector){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait-for-selector',$selector)|Out-Null;Write-Output "Screenshot: $name"}
try{
 Run setup|Out-Null
 if(!$TransitionsOnly){
 $held=Nav switchTab '/pages/items/index';Check ($held.shown -join ',') '2,1' 'Main page only shows active and idle';Check ($held.categories -join ',') '全部分类,数码,日用' 'Held categories exclude archive';Shot held '.item-card'
 Tap '.filter-control';Check (Run state).navigationHidden $true 'Filter hides glass navigation';Shot held-filter '.sheet-apply'
 $geometry=Run measure;$evidence.Add($geometry);Check ($geometry.rects[1][0].height -ge 44) $true 'Filter confirm is accessible'
 Tap '.sheet-reset';Tap '.sheet-apply';Check (Run state).navigationHidden $false 'Apply restores navigation';Check ((Run state).shown -join ',') '2,1' 'Reset retains held scope'
 Nav switchTab '/pages/me/index'|Out-Null;Shot me '#menu-disposed';Tap '#menu-disposed';WaitRoute 'pages/disposed/index'
 $archive=Run load;Check $archive.route 'pages/disposed/index' 'Me opens archive';Check ($archive.shown -join ',') '3,6,5,4' 'Archive only shows disposed, pin first';Shot archive '.item-card'
 Tap '.filter-control';Shot archive-filter '.sheet-apply';$evidence.Add((Run measure));Tap '.sheet-close';Check (Run state).filterOpen $false 'Archive filter closes'
 Run retry-setup|Out-Null;Shot archive-photo-error '.photo-retry';Tap '.photo-retry';Check (Run state).photos.5 'ready' 'Archive photo retry updates thumbnail'
 Tap '#item-3';WaitRoute 'pages/item/index';$detail=Run load;Check $detail.itemStatus 'disposed' 'Archived card opens existing detail';Shot archive-detail '.cost-card'
 $archive=Nav redirectTo '/pages/disposed/index';Check ($archive.shown -join ',') '3,6,5,4' 'Archive re-entry refreshes correctly'
 $empty=Run empty;Check $empty.items.Count 0 'Archive empty state';Shot archive-empty '.archive-return';Tap '.archive-return';WaitRoute 'pages/items/index';Check (Run state).route 'pages/items/index' 'Empty action returns to held page';Run normal|Out-Null
 }
 Nav navigateTo '/pages/record/index?itemId=1&kind=disposal'|Out-Null;$saved=Run save;Check ($saved.toasts -contains '已归入处置档案') $true 'Disposal save shows archive notice'
 $held=Nav switchTab '/pages/items/index';Check ($held.shown -join ',') '2' 'Disposed item leaves main page'
 $archive=Nav navigateTo '/pages/disposed/index';Check ($archive.shown -contains 1) $true 'Disposed item joins archive'
 Nav navigateTo '/pages/record/index?itemId=1&kind=disposal&id=101'|Out-Null;Run delete-record|Out-Null
 $held=Nav switchTab '/pages/items/index';Check ($held.shown -join ',') '2,1' 'Undo follows actual idle status back to held list'
 $archive=Nav navigateTo '/pages/disposed/index';Check ($archive.shown -contains 1) $false 'Undo removes item from archive'
 Nav navigateTo '/pages/item/index?id=3'|Out-Null;Run trash|Out-Null
 $archive=Nav redirectTo '/pages/disposed/index';Check ($archive.shown -contains 3) $false 'Trash hides disposed item from archive'
 $trash=Nav redirectTo '/pages/trash/index';Check ($trash.items -contains 3) $true 'Trash still contains archived item';Run restore-item|Out-Null
 $archive=Nav redirectTo '/pages/disposed/index';Check ($archive.shown -contains 3) $true 'Restore returns disposed item to archive'
 $evidence.Add((Run state))
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;transitionsOnly=[bool]$TransitionsOnly;checks=$checks;evidence=$evidence;fixtureOnly=$true;remoteWrites=0;limitations=@('Native navigateBack currently reports success without popping the simulator stack; redirectTo/switchTab used for re-entry checks. Physical back gesture remains unverified.','Physical devices, including Xiaomi K80 Ultra, not tested.')} -Depth 20))
 Write-Output "Passed $($checks.Count) native checks"
}finally{Run restore|Out-Null;Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null;Write-Output 'Original memory session and transport restored'}
