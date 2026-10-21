$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/welcome-collection-20261011'))
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags) {
  $raw=(& wechatide -c Codex $tool --project $project @flags | Out-String)
  $result=$raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
  if (!$result.ok -or !$result.result.success) { throw $raw }
  return $result.result
}
function Eval([string]$code) { return (Ide automation_evaluate @('--fn-source',$code)).result.result }
function Tap { Ide automation_element_action @('--action','tap','--selector','.login-button','--wait-for-selector','.login-button') | Out-Null }
function Shot([string]$name) { Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait-for-selector','.login-button') | Out-Null;Write-Output "Screenshot: $name" }
function Check($actual,$expected,[string]$label) { if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label) }
try {
 Eval "function(){const a=getApp();if(a._welcomeQA)return true;a._welcomeQA={hasSession:a.hasSession,login:a.login,switchTab:wx.switchTab,calls:0,navigation:[]};a.hasSession=()=>false;a.login=()=>{a._welcomeQA.calls++;return new Promise((resolve,reject)=>{a._welcomeQA.resolve=resolve;a._welcomeQA.reject=reject;});};wx.switchTab=o=>{a._welcomeQA.navigation.push(o.url);if(o.success)o.success({errMsg:'switchTab:ok'});};return true;}" | Out-Null
 Ide automation_navigate @('--action','redirectTo','--url','/pages/login/index') | Out-Null
 $geometry=Eval "function(){const p=getCurrentPages().slice(-1)[0];return new Promise(resolve=>{const q=wx.createSelectorQuery().in(p);['.welcome','.brand','.title','.welcome-art','.sample-card','.feature-hints','.login-button','.welcome-note','.login-control'].forEach(s=>q.select(s).boundingClientRect());q.exec(r=>resolve({rects:r,window:wx.getWindowInfo(),errors:[p.data.logoFailed,p.data.titleFailed,p.data.heroFailed,p.data.cameraFailed,p.data.decorFailed]}));});}"
 Check ($geometry.errors -contains $true) $false 'All production images load in WeChat'
 Check ($geometry.rects[6].height -ge 44) $true 'Native login hit height is at least 44px'
 Check ([Math]::Abs($geometry.rects[6].width-$geometry.rects[8].width) -lt 1) $true 'Native yellow login button fills its intended width'
 Shot home
 Tap;Tap
 $busy=Eval "function(){const a=getApp(),p=getCurrentPages().slice(-1)[0];p.login();return {calls:a._welcomeQA.calls,busy:p.data.busy,error:p.data.error};}"
 Check $busy.calls 1 'Repeated native taps and direct invocation create one login request'
 Check $busy.busy $true 'Login is busy until promise settles'
 Shot loading
 $failed=Eval "function(){getApp()._welcomeQA.reject(new Error('模拟网络失败，请重试'));return new Promise(resolve=>setTimeout(()=>{const p=getCurrentPages().slice(-1)[0];resolve({busy:p.data.busy,error:p.data.error,navigation:getApp()._welcomeQA.navigation.length});},200));}"
 Check $failed.busy $false 'Failure re-enables native login button'
 Check ([string]::IsNullOrEmpty($failed.error)) $false 'Failure is visible and retry remains possible'
 Check $failed.navigation 0 'Failure does not navigate'
 Shot failure
 Tap
 Check (Eval "function(){return getCurrentPages().slice(-1)[0].data.error;}") '' 'Retry clears the previous error'
 $success=Eval "function(){getApp()._welcomeQA.resolve();return new Promise(resolve=>setTimeout(()=>{const a=getApp(),p=getCurrentPages().slice(-1)[0];resolve({busy:p.data.busy,calls:a._welcomeQA.calls,url:a._welcomeQA.navigation[0]});},200));}"
 Check $success.calls 2 'Retry creates exactly one additional isolated login request'
 Check $success.busy $false 'Success clears loading state'
 Check $success.url '/pages/items/index' 'Success requests the existing item tab'
 $session=Eval "function(){const a=getApp();a.hasSession=()=>true;getCurrentPages().slice(-1)[0].onLoad();a.hasSession=()=>false;return a._welcomeQA.navigation.length;}"
 Check $session 2 'Existing session skips welcome through the same tab route'
 $fallback=Eval "function(){const p=getCurrentPages().slice(-1)[0];p.logoError();['title','hero','camera','feature','decor'].forEach(asset=>p.assetError({currentTarget:{dataset:{asset}}}));return {title:p.data.titleFailed,hero:p.data.heroFailed,busy:p.data.busy};}"
 Check $fallback.title $true 'Failed handwritten title exposes native text'
 Check $fallback.hero $true 'Failed hero exposes local text fallback'
 Check $fallback.busy $false 'Artwork failures do not disable login'
 Shot art-fallback
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{checks=$checks;geometry=$geometry;fixtureOnly=$true;remoteWrites=0;actualModel='iPhone 14 Pro Max simulator';otherWidths='Browser production-template rendering';realDevices='Not tested'} -Depth 15))
 Write-Output "Passed $($checks.Count) native checks; remote writes: 0"
} finally {
 Eval "function(){const a=getApp(),s=a._welcomeQA;if(s){a.hasSession=s.hasSession;a.login=s.login;wx.switchTab=s.switchTab;delete a._welcomeQA;}return true;}" | Out-Null
 Ide automation_navigate @('--action','redirectTo','--url','/pages/login/index') | Out-Null
 Write-Output 'Original login, session check and navigation restored'
}
