$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/status-paws-20261012'))
$summarySource=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'me-glass-native-check.js')).Replace("`r",'').Replace("`n",' ')
$purchaseSource=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'purchases-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Fixture([string]$source,[string]$action){$arg=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($arg,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$arg)).result.result}
function Eval([string]$source){$safeSource=$source.Replace('"',"'");return (Ide automation_evaluate @('--fn-source',$safeSource)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null;Write-Output "Screenshot: $name"}
function Check($value,[string]$label){if(!$value){throw $label};$checks.Add($label)}
try{
 Fixture $summarySource setup|Out-Null;Fixture $purchaseSource setup|Out-Null
 foreach($name in @('wishlist','fixed-expenses')){
  Ide automation_navigate @('--action','navigateTo','--url',('/pages/'+$name+'/index'),'--wait','1')|Out-Null;Shot $name
  $g=Eval 'function(){const p=getCurrentPages().slice(-1)[0];return new Promise(resolve=>wx.createSelectorQuery().in(p).select(".list-filter").boundingClientRect().select(".status-filter-icon").boundingClientRect().exec(r=>resolve({route:p.route,index:p.data.filterIndex,height:r[0].height,icon:r[1].width,error:p.data.error})));}'
  Check ($g.route -eq ('pages/'+$name+'/index') -and $g.height -ge 44 -and $g.icon -eq 20 -and !$g.error) ($name+' pill layout and list loaded')
  $event=Join-Path $output 'change.json';[IO.File]::WriteAllText($event,'{"value":1}')
  Ide automation_element_action @('--action','trigger','--selector','.status-filter-picker','--type','change','--detail-file',$event)|Out-Null
  $s=Eval 'function(){const p=getCurrentPages().slice(-1)[0];return {index:p.data.filterIndex,shown:p.data.shown.length};}'
  Check ($s.index -eq 1 -and $s.shown -eq 0) ($name+' status change preserved')
 }
 Fixture $purchaseSource restore|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/me/index','--wait','1')|Out-Null;Shot me
 $g=Fixture $summarySource measure;Check ($g.rects[4].bottom -le $g.rects[3].top+2) 'Paws do not overlap nickname';Check ($g.rects[1].bottom -ge $g.rects[0].bottom-1) 'Cream background follows profile';Check ($g.rects[5].width -gt 0) 'Glass overview retained'
 $s=Eval 'function(){return {writes:getApp()._summaryAmountQA.calls.filter(c=>c.method!=="GET").length};}'
 Check ($s.writes -eq 0) 'No backend writes'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;fixtureOnly=$true;checks=$checks} -Depth 10));Write-Output "Passed $($checks.Count) checks"
}catch{[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 10));throw}finally{Fixture $purchaseSource restore|Out-Null;Fixture $summarySource restore|Out-Null;Ide automation_navigate @('--action','switchTab','--url','/pages/items/index')|Out-Null}
