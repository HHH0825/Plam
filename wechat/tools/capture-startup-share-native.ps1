$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/beauty-icons-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/startup-share-20261020/native'))
if([IO.File]::ReadAllText((Join-Path $project 'config.js')) -notmatch '127\.0\.0\.1:9'){throw 'Offline project required'}
function Ide([string]$tool,[string[]]$flags){
 $raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String)
 if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$r.ok -or ($r.result.success -eq $false)){throw $raw};return $r.result
}
# Preserve page-meta as the first node in the final artifact and compile it.
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../miniprogram/pages/items/index.wxml') -Destination (Join-Path $project 'pages/items/index.wxml')
Ide compile_wxml @('--file-path','pages/items/index.wxml')|Out-Null
Ide compile_wxss @('--file-path','pages/items/index.wxss')|Out-Null
Ide simulator_open_page @('--page','pages/login/index')|Out-Null
Start-Sleep -Seconds 3
Ide simulator_screenshot @('--path',(Join-Path $out 'login-native.png'),'--optimize','false','--wait','1')|Out-Null
Ide automation_evaluate @('--fn-source',"function(){getApp().globalData={token:'isolated-rewards-preview',expiresAt:4102444800,user:{id:101,username:'离线体验',avatar_key:'cat'}};return true}")|Out-Null
Ide automation_navigate @('--action','reLaunch','--url','/pages/items/index')|Out-Null
Ide simulator_screenshot @('--path',(Join-Path $out 'items-native.png'),'--optimize','false','--wait','1')|Out-Null
Ide automation_navigate @('--action','navigateTo','--url','/pages/rewards/index')|Out-Null
Ide simulator_screenshot @('--path',(Join-Path $out 'rewards-native.png'),'--optimize','false','--wait','1')|Out-Null
Ide get_simulator_console @('--command','grep -n .')|ConvertTo-Json -Depth 8|Set-Content (Join-Path $out 'console-final.json') -Encoding UTF8
