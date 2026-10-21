$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/ledger-navigation-20261013'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'items-header-native-check.js')).Replace("`r",'').Replace("`n",' ').Replace('p.onShow();','p.onShow?.();')
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$file=Join-Path $output 'back-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Eval([string]$js){return (Ide automation_evaluate @('--fn-source',$js.Replace('"',"'"))).result.result}
try{
 Run setup|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/statistics/index','--wait','1')|Out-Null
 Ide automation_element_action @('--action','tap','--selector','.preparing-analysis','--wait-for-selector','.preparing-analysis','--wait','1')|Out-Null
 $analysis=Eval 'function(){return getCurrentPages().slice(-1)[0].route;}'
 if($analysis -ne 'pages/insights/index'){throw 'Analysis entry failed'}
 Ide simulator_screenshot @('--path',(Join-Path $output 'analysis-entry-native.png'),'--optimize','false','--wait','1')|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/ledger/index','--wait','1')|Out-Null
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().add();}'|Out-Null
 Ide simulator_screenshot @('--path',(Join-Path $output 'back-before-native.png'),'--optimize','false','--wait','1')|Out-Null
 $back=Eval 'function(){const p=getCurrentPages().slice(-1)[0],b=p.getTabBar();return new Promise(resolve=>{let finished=false;const done=result=>{if(finished)return;finished=true;setTimeout(()=>resolve({result,menuOpen:b.data.menuOpen,route:getCurrentPages().slice(-1)[0].route}),300)};setTimeout(()=>done("timeout"),1500);wx.navigateBack({delta:1,success:()=>done("success"),fail:e=>done(e.errMsg)});});}'
 Ide simulator_screenshot @('--path',(Join-Path $output 'back-after-native.png'),'--optimize','false','--wait','1')|Out-Null
 $nativeBack=(!$back.menuOpen -and $back.route -eq 'pages/ledger/index')
 if(!$nativeBack){Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().closeMenu();}'|Out-Null}
 $writes=Eval 'function(){return getApp()._itemsHeaderQA.calls.filter(c=>c.method!=="GET").length;}'
 if($writes -ne 0){throw 'Unexpected fixture writes'}
 [IO.File]::WriteAllText((Join-Path $output 'native-back-results.json'),(ConvertTo-Json -InputObject @{analysisEntry=$true;nativeApiBack=$nativeBack;back=$back;remoteWrites=0;fixtureOnly=$true;physicalBackGestureTested=$false} -Depth 10));Write-Output "Analysis entry passed. Native back closed menu: $nativeBack"
}finally{Run restore|Out-Null;Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null}
