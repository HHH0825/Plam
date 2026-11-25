param([int]$StartIndex=0)
$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/beauty-icons-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/startup-share-20261020/native'))
[IO.Directory]::CreateDirectory($out)|Out-Null
if([IO.File]::ReadAllText((Join-Path $project 'config.js')) -notmatch '127\.0\.0\.1:9'){throw 'Offline project required'}
function Ide([string]$tool,[string[]]$flags){
 $raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String)
 if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$r.ok -or ($r.result.success -eq $false)) {
  if($tool -eq 'automation_evaluate'){
   $raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
  }
  if(!$r.ok -or ($r.result.success -eq $false)){throw $raw}
 };return $r.result
}
Ide simulator_open_page @('--page','pages/items/index')|Out-Null
Start-Sleep -Seconds 2
$account="function(){const a=getApp();a.globalData={token:'isolated-rewards-A',expiresAt:4102444800,user:{id:101,username:'离线体验',avatar_key:'cat'}};return true}"
$initial=(Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];return {route:p.route,card:p.onShareAppMessage({from:'menu'})}}")).result.result
for($j=0;$j -lt 12 -and $initial.route -ne 'pages/login/index';$j++){
 Start-Sleep -Seconds 1
 $initial=(Ide automation_evaluate @('--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];return {route:p.route,card:p.onShareAppMessage({from:'menu'})}}")).result.result
}
if($initial.route -ne 'pages/login/index' -or $initial.card.path -ne '/pages/items/index'){throw 'Expected public login share'}
Ide automation_evaluate @('--fn-source',$account)|Out-Null
Ide automation_navigate @('--action','reLaunch','--url','/pages/items/index')|Out-Null
$app=Get-Content (Join-Path $project 'app.json') -Raw|ConvertFrom-Json
$routes=@($app.pages)+@($app.subPackages|ForEach-Object {$pkg=$_;@($pkg.pages|ForEach-Object {$pkg.root+'/'+$_})})
$results=@()
if($StartIndex -gt 0){$results=@((Get-Content (Join-Path $out 'checks.json') -Raw|ConvertFrom-Json).checks)}
foreach($route in $routes[$StartIndex..($routes.Count-1)]){
 foreach($type in @('wxml','wxss')){Ide ('compile_'+$type) @('--file-path',($route+'.'+$type))|Out-Null}
 if($route -eq 'pages/login/index'){$results+=@{passed=$true;route=$route;compiled=$true;sharing='verified before login'};continue}
 if($app.tabBar.list.pagePath -contains $route){Ide automation_navigate @('--action','switchTab','--url',('/'+$route))|Out-Null}
 else{
  $query=if($route -eq 'pages/record/index'){'?itemId=1&kind=maintenance'}else{'?id=1'}
  $argsFile=Join-Path $out 'navigation-args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @('/'+$route+$query) -Compress))
  Ide automation_evaluate @('--fn-source','function(url){return new Promise((resolve,reject)=>wx.navigateTo({url,success:resolve,fail:reject}))}','--args-file',$argsFile)|Out-Null
 }
 $fn="function(){const p=getCurrentPages().slice(-1)[0];return {route:p.route,card:p.onShareAppMessage({from:'menu'}),error:p.data.error||'',custom:!!p.getTabBar?.()}}"
 $r=(Ide automation_evaluate @('--fn-source',$fn)).result.result
 if($r.route -ne $route -or !($r.card.path -eq '/pages/items/index' -or ($route -eq 'pages/rewards/index' -and $r.card.path.StartsWith('/pages/items/index?invite='))) -or !($r.card.imageUrl -eq '/assets/white-doodle/share-fallback.png' -or ($route -eq 'pages/rewards/index' -and $r.card.imageUrl -eq '/pages/rewards/assets/invitation.png'))){throw ($r|ConvertTo-Json -Depth 6)}
 if($route -eq 'pages/rewards/index'){
  $fn="function(){const p=getCurrentPages().slice(-1)[0];return {route:p.route,owner:p._owner===getApp().globalData.token,code:p.data.inviteCode,card:p.onShareAppMessage({from:'button'})}}"
  $invite=(Ide automation_evaluate @('--fn-source',$fn)).result.result
  if(!$invite.owner -or !$invite.card.path.Contains('?invite=') -or $invite.card.imageUrl -ne '/pages/rewards/assets/invitation.png'){throw ($invite|ConvertTo-Json -Depth 6)}
  $results+=@{invitation=$true;state=$invite}
 }
 $results+=@{passed=$true;state=$r};Write-Output ('Compiled and checked share: '+$route)
 if(!($app.tabBar.list.pagePath -contains $route)){Ide automation_navigate @('--action','navigateBack')|Out-Null}
 @{passed=$true;fixtureOnly=$true;realDevice=$false;cloudWrites=0;checks=$results}|ConvertTo-Json -Depth 12|Set-Content (Join-Path $out 'checks.json') -Encoding UTF8
}
foreach($name in @('cat-loading','cat-feedback')){foreach($type in @('wxml','wxss')){Ide ('compile_'+$type) @('--file-path',('components/'+$name+'/index.'+$type))|Out-Null}}
Ide get_simulator_console @('--command','grep -n .')|ConvertTo-Json -Depth 8|Set-Content (Join-Path $out 'console.json') -Encoding UTF8
