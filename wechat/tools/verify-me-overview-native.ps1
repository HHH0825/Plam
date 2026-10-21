$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/me-overview-20261011'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'me-overview-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
$limitations=[System.Collections.Generic.List[string]]::new()
$backTraces=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags) {
 $raw=(& wechatide -c Codex $tool --project $project @flags | Out-String)
 $result=$raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
 if(!$result.ok -or !$result.result.success){throw $raw};return $result.result
}
function Eval([string]$code){return (Ide automation_evaluate @('--fn-source',$code)).result.result}
function Run([string]$action){$arg=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($arg,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$arg)).result.result}
function Check($actual,$expected,[string]$label){if($actual -ne $expected){throw "$label expected $expected got $actual"};$checks.Add($label)}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait-for-selector','#menu-settings') | Out-Null;Write-Output "Screenshot: $name"}
function WaitRoute([string]$route){$actual=Eval "function(){return new Promise(resolve=>{let n=0;const check=()=>{const p=getCurrentPages().slice(-1)[0];if(p.route==='$route'||n++>40)resolve(p.route);else setTimeout(check,100);};check();});}";Check $actual $route "Reached $route"}
function ReturnMe {
 $trace=Run back;$backTraces.Add($trace)
 if($trace.after[-1] -ne 'pages/me/index'){
  $limitations.Add('Native navigateBack reports ok but leaves the page stack unchanged; switchTab used to verify Me re-entry. Native back gesture remains unverified; frontend return regressions pass.')
  Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null
  WaitRoute 'pages/items/index'
  Ide automation_navigate @('--action','switchTab','--url','/pages/me/index') | Out-Null
 }
 WaitRoute 'pages/me/index'
}
try{
 Run setup | Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/me/index') | Out-Null;WaitRoute 'pages/me/index'
 $geometry=Run measure
 Check $geometry.heldItems '28' 'Native held count is loaded'
 Check $geometry.heldAmount '12,680.00' 'Native amount is formatted'
 Check $geometry.accountDays '128' 'Native age is loaded'
 Check $geometry.avatarFailed $false 'Native avatar loads'
 Check ([Math]::Abs($geometry.rects[0].width-$geometry.rects[0].height) -lt 1) $true 'Avatar is circular'
 Check ($geometry.rects[2].height -ge 56) $true 'Settings hit height is at least 56px'
 Shot home
 Ide automation_element_action @('--action','tap','--selector','.profile-hero','--wait-for-selector','.profile-hero') | Out-Null;WaitRoute 'pages/profile/index'
 Run rename | Out-Null
 ReturnMe
 Check (Run state).username '返回后已刷新' 'Returning from profile refreshes Me'
 Ide automation_element_action @('--action','tap','--selector','#menu-settings','--wait-for-selector','#menu-settings') | Out-Null;WaitRoute 'pages/profile/index'
 ReturnMe
 $errorState=Run 'mode:stats-error';Check ([string]::IsNullOrEmpty($errorState.statsError)) $false 'Stats failure is visible';Check $errorState.days '128' 'Profile survives stats failure';Shot stats-error
 Run 'set-mode:normal' | Out-Null
 Ide automation_element_action @('--action','tap','--selector','.retry-button','--wait-for-selector','.retry-button') | Out-Null
 Check (Run state).statsError '' 'Retry clears old stats error'
 $legacy=Run 'mode:legacy';Check $legacy.heldItems '—' 'Old backend never substitutes lifetime totals';Check $legacy.days '—' 'Missing age remains unknown';Shot legacy
 $empty=Run 'mode:empty';Check $empty.heldItems '0' 'Real empty count stays zero';Check $empty.amount '0.00' 'Real empty amount stays zero';Shot empty
 $profileError=Run 'mode:profile-error';Check ([string]::IsNullOrEmpty($profileError.error)) $false 'Profile failure is visible';Check $profileError.heldItems '28' 'Stats survive profile failure';Shot profile-error
 Run 'mode:normal' | Out-Null
 Eval "function(){wx.pageScrollTo({scrollTop:10000,duration:0});return true;}" | Out-Null;Shot scrolled
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{checks=$checks;limitations=$limitations;backTraces=$backTraces;geometry=$geometry;fixtureOnly=$true;remoteRequests=0;realDevices='Not tested'} -Depth 15))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 Run restore | Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null
 Write-Output 'Original memory session and transport restored; no session storage modified'
}
