$ErrorActionPreference='Stop'
$toolFolder=$PSScriptRoot
$definitions=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'verify-me-glass-native.ps1')).Split(@('try{'),[StringSplitOptions]::None)[0]
Invoke-Expression ($definitions.Replace('$PSScriptRoot','$toolFolder'))
try{
 Run setup|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/me/index')|Out-Null
 Run mode normal|Out-Null;Run scroll '#menu-settings'|Out-Null
 Tap '#menu-settings'
 $route=(Ide automation_evaluate @('--fn-source',"function(){return new Promise(resolve=>{let n=0;const check=()=>{const route=getCurrentPages().slice(-1)[0].route;if(route==='pages/profile/index'||n++>=20)resolve(route);else setTimeout(check,100);};check();});}")).result.result
 Check $route 'pages/profile/index' 'Personal settings opens in fresh page flow'
 $all=Run inspect;Check (@($all.calls|Where-Object method -ne 'GET').Count) 0 'No write requests'
 [IO.File]::WriteAllText((Join-Path $output 'native-settings-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;remoteWrites=0} -Depth 20))
 Write-Output "Passed $($checks.Count) settings checks"
}catch{
 [IO.File]::WriteAllText((Join-Path $output 'native-settings-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message;fixtureOnly=$true} -Depth 20));throw
}finally{
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null
 Run restore|Out-Null
 Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];p.getTabBar()?.setData({hidden:false});p.onShow();return {fixture:!!getApp()._summaryAmountQA,route:p.route};}")|Out-Null
 Write-Output 'Original account and transport restored'
}
