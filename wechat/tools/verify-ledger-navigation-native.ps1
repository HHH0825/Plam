$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/ledger-navigation-20261013'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'items-header-native-check.js')).Replace("`r",'').Replace("`n",' ').Replace('p.onShow();','p.onShow?.();')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Eval([string]$js){return (Ide automation_evaluate @('--fn-source',$js.Replace('"',"'"))).result.result}
function State{return Eval 'function(){const p=getCurrentPages().slice(-1)[0],b=p.getTabBar?.();return {route:p.route,bar:b?.data,query:p.data.query,filter:p.data.filterOpen,scroll:p._scroll,anchor:p._anchor,calls:getApp()._itemsHeaderQA.calls};}'}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null;Write-Output "Screenshot: $name"}
function Check($value,[string]$label){if(!$value){throw $label};$checks.Add($label)}
try{
 Run setup|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/ledger/index','--wait','1')|Out-Null
 $s=State;Check ($s.bar.selectedRoute -eq 'pages/ledger/index') 'Ledger route selected';Shot ledger
 $g=Eval 'function(){const p=getCurrentPages().slice(-1)[0],b=p.getTabBar();return new Promise(resolve=>{const timer=setTimeout(()=>resolve({measurementUnavailable:true}),1500);wx.createSelectorQuery().in(b).selectAll(".tab").boundingClientRect().select(".add").boundingClientRect().select(".tab-bar").boundingClientRect().exec(r=>{clearTimeout(timer);resolve({tabs:r[0],add:r[1],bar:r[2]})});});}'
 if(!$g.measurementUnavailable){Check ($g.tabs.Count -eq 4 -and @($g.tabs|Where-Object {$_.width -lt 44 -or $_.height -lt 44}).Count -eq 0) 'Four tab touch targets at least 44px'
 Check ([Math]::Abs($g.bar.height-64) -lt 1) 'Native navigation is 64px high'}
 $reads=$s.calls.Count
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().switchTab({currentTarget:{dataset:{route:"pages/statistics/index"}}});}'|Out-Null
 Shot statistics;$s=State;Check ($s.route -eq 'pages/statistics/index' -and $s.bar.selectedRoute -eq $s.route) 'Statistics switch and selected state';Check ($s.calls.Count -eq $reads) 'Preparing pages make no backend requests'
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().add();}'|Out-Null;Shot new-menu
 $m=Eval 'function(){const p=getCurrentPages().slice(-1)[0],b=p.getTabBar();return new Promise(resolve=>{const timer=setTimeout(()=>resolve({measurementUnavailable:true,open:b.data.menuOpen}),1500);wx.createSelectorQuery().in(b).select(".new-entry-panel").boundingClientRect().selectAll(".new-entry-choice").boundingClientRect().select(".new-entry-close").boundingClientRect().exec(r=>{clearTimeout(timer);resolve({open:b.data.menuOpen,panel:r[0],choices:r[1],close:r[2]})});});}'
 Check $m.open 'Native menu opened';if(!$m.measurementUnavailable){Check ($m.open -and $m.choices.Count -eq 2 -and $m.panel.height -gt 0) 'Native page-container menu rendered'
 Check ($m.close.width -eq 44 -and $m.close.height -eq 44) 'Close button is 44px'
 Check ([Math]::Abs($m.choices[0].width-$m.choices[1].width) -lt 1 -and [Math]::Abs($m.choices[0].top-$m.choices[1].top) -lt 1) 'Menu choices are equal side-by-side tiles'
 Check ([Math]::Abs($m.panel.right-$m.close.right-12) -lt 1) 'Close button is 12px from panel right'}
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().chooseEntry({currentTarget:{dataset:{action:"ledger"}}});}'|Out-Null
 Shot ledger-return;$s=State;Check ($s.route -eq 'pages/ledger/index' -and !$s.bar.menuOpen) 'Record choice navigates after native dismissal'
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().switchTab({currentTarget:{dataset:{route:"pages/items/index"}}});}'|Out-Null
 Shot items;$s=State;Check ($s.route -eq 'pages/items/index' -and $s.bar.selectedRoute -eq $s.route) 'Items selected by route'
 Eval 'function(){const p=getCurrentPages().slice(-1)[0];p._scroll=420;p.getTabBar().add();}'|Out-Null
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().chooseEntry({currentTarget:{dataset:{action:"item"}}});}'|Out-Null
 Shot editor;$s=State;Check ($s.route -eq 'pages/editor/index') 'Add item opens existing editor'
 Ide automation_navigate @('--action','navigateBack','--wait','1')|Out-Null;Shot items-return;$s=State
 Check ($s.route -eq 'pages/items/index' -and $s.anchor) 'Editor return retains item anchor'
 Eval 'function(){const p=getCurrentPages().slice(-1)[0];p.openFilters();}'|Out-Null;Shot filter;$s=State;Check ($s.filter -and $s.bar.hidden) 'Filter hides navigation'
 Eval 'function(){getCurrentPages().slice(-1)[0].closeFilters();}'|Out-Null
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().switchTab({currentTarget:{dataset:{route:"pages/me/index"}}});}'|Out-Null
 Shot me;$s=State;Check ($s.route -eq 'pages/me/index' -and $s.bar.selectedRoute -eq $s.route) 'My switch and selected state'
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().add();}'|Out-Null
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().closeMenu();}'|Out-Null
 $s=State;Check (!$s.bar.menuOpen) 'Close menu without navigation'
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().iconFailed({currentTarget:{dataset:{key:"statistics"}}});}'|Out-Null
 Shot icon-fallback;Check (State).bar.iconErrors.statistics 'Icon failure fallback'
 $s=State;Check (@($s.calls|Where-Object method -ne 'GET').Count -eq 0) 'No business writes'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;geometry=$g;menu=$m;fixtureOnly=$true;interaction='component handlers in native runtime'} -Depth 16));Write-Output "Passed $($checks.Count) native checks"
}catch{[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 12));throw}finally{
 Run restore|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 Write-Output 'Original account and requests restored'
}
