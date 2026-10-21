$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/dots-glass-20261011'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'dots-glass-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new();$evidence=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$result=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$result.ok -or !$result.result.success){throw $raw};return $result.result}
function Eval([string]$code){return (Ide automation_evaluate @('--fn-source',$code)).result.result}
function Run([string]$action){$arg=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($arg,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$arg)).result.result}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
function WaitRoute([string]$route){$result=Eval "function(){return new Promise(resolve=>{let n=0;const check=()=>{const p=getCurrentPages().slice(-1)[0];if(p.route==='$route'||n++>40)resolve(p.route);else setTimeout(check,100);};check();});}";Check $result $route "Reached $route"}
function Nav([string]$action,[string]$url){Ide automation_navigate @('--action',$action,'--url',$url)|Out-Null;WaitRoute $url.Split('?')[0].TrimStart('/')}
function Tap([string]$selector){Ide automation_element_action @('--action','tap','--selector',$selector,'--wait-for-selector',$selector)|Out-Null}
function Shot([string]$name,[string]$selector){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1','--wait-for-selector',$selector)|Out-Null;Write-Output "Screenshot: $name"}
try{
 Nav switchTab '/pages/items/index'
 Eval "function(){const p=getCurrentPages().slice(-1)[0];p.getTabBar().setData({glassFallback:false,glassNoBlur:false});p.onShow();return p.load().then(()=>new Promise(resolve=>{let n=0;const read=()=>{const paths=Object.values(p.data.photoPaths||{});if(paths.some(v=>v.startsWith('http://tmp/'))||n++>50)resolve({ready:paths.length,shown:p.data.shown?.length});else setTimeout(read,100);};read();}));}"|Out-Null
 $setup=Run setup;$evidence.Add($setup);Check $setup.usingCachedRealPhoto $true 'Real cached photograph used for blur comparison'
 Nav switchTab '/pages/me/index';Run load|Out-Null;Shot me '.overview-card'
 Nav switchTab '/pages/items/index';$held=Run load;Check $held.shown 10 'Isolated ten-item list';Shot items '.item-card'
 $evidence.Add((Run align-photo));$evidence.Add((Run measure));Shot glass-on '.thumbnail'
 Run no-blur|Out-Null;Shot glass-off '.thumbnail';Run enhanced|Out-Null
 Run fallback|Out-Null;Shot glass-fallback '.thumbnail';Run enhanced|Out-Null
 Ide automation_viewport_action @('--action','pageScrollTo','--scroll-top','0')|Out-Null
 Tap '.filter-control';Check (Run state).hidden $true 'Filter hides navigation';Shot filter '.sheet-apply'
 $geo=Run measure;$evidence.Add($geo);Check ($geo.rects[2][0].height -ge 44) $true 'Filter confirm keeps touch height'
 Tap '.sheet-reset';Tap '.sheet-apply';Check (Run state).hidden $false 'Reset/confirm restores navigation'
 Tap '#item-990091';WaitRoute 'pages/item/index';Run load|Out-Null;Run expanded|Out-Null;Shot detail '.cost-card';$evidence.Add((Run measure))
 Nav switchTab '/pages/items/index';Run load|Out-Null
 Eval "function(){const p=getCurrentPages().slice(-1)[0];p.getTabBar().add();return true;}"|Out-Null;WaitRoute 'pages/editor/index';Shot editor '.editor-page'
 Nav redirectTo '/pages/login/index';Shot login '.login-button'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;evidence=$evidence;fixtureOnly=$true;remoteWrites=0;limitations=@('Computed-style queries inside the custom tab component fail in the automator; blur verified through same-scroll screenshots.','Physical iOS/Android devices and Xiaomi K80 Ultra not tested.')} -Depth 20))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 Run restore|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null
 Eval "function(){const p=getCurrentPages().slice(-1)[0];p.getTabBar().setData({glassFallback:false,glassNoBlur:false});p.onShow();return true;}"|Out-Null
 Write-Output 'Original memory session, photo cache methods and transport restored'
}
