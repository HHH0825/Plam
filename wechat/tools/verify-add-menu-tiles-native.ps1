$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/add-menu-tiles-20261013'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'items-header-native-check.js')).Replace("`r",'').Replace("`n",' ').Replace('p.onShow();','p.onShow?.();')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& wechatide -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$f=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($f,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$f)).result.result}
function Eval([string]$js){return (Ide automation_evaluate @('--fn-source',$js.Replace('"',"'"))).result.result}
function State{return Eval 'function(){const p=getCurrentPages().slice(-1)[0];return {route:p.route,bar:p.getTabBar?.()?.data,writes:getApp()._itemsHeaderQA.calls.filter(c=>c.method!=="GET").length};}'}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($value,[string]$label){if(!$value){throw $label};$checks.Add($label)}
try{
 Run setup|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().add();}'|Out-Null;Shot menu
 $m=Eval 'function(){const b=getCurrentPages().slice(-1)[0].getTabBar();return new Promise(resolve=>{const timer=setTimeout(()=>resolve({measurementUnavailable:true}),2000),q=wx.createSelectorQuery().in(b);q.select(".new-entry-panel").boundingClientRect().selectAll(".new-entry-choice").boundingClientRect().select(".new-entry-close").boundingClientRect().selectAll(".new-entry-icon").boundingClientRect().exec(r=>{clearTimeout(timer);resolve({panel:r[0],choices:r[1],close:r[2],icons:r[3]})});});}'
 Check (!$m.measurementUnavailable -and $m.choices.Count -eq 2) 'Two native tiles rendered'
 $left=$m.choices[0];$right=$m.choices[1]
 Check ($left.dataset.action -eq 'ledger' -and $right.dataset.action -eq 'item') 'Record on left, item on right'
 Check ([Math]::Abs($left.top-$right.top) -lt 1 -and [Math]::Abs($left.height-$right.height) -lt 1 -and [Math]::Abs($left.width-$right.width) -lt 1) 'Tiles share a row and equal dimensions'
 Check ([Math]::Abs($right.left-$left.right-12) -lt 1) 'Tile gap is 12px'
 Check ([Math]::Abs($left.left-$m.panel.left-18) -lt 1 -and [Math]::Abs($m.panel.right-$right.right-18) -lt 1) 'Tiles fill panel content width'
 Check ($left.height -ge 170 -and $m.icons[0].width -eq 56) 'Large native tiles and 56px icons'
 Check ($m.close.width -eq 44 -and [Math]::Abs($m.panel.right-$m.close.right-12) -lt 1) 'Close target and right alignment preserved'
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().closeMenu();}'|Out-Null
 Check (!(State).bar.menuOpen) 'Close handler dismisses menu'
 Eval 'function(){const b=getCurrentPages().slice(-1)[0].getTabBar();b.add();}'|Out-Null
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().chooseEntry({currentTarget:{dataset:{action:"ledger"}}});}'|Out-Null
 Shot ledger-destination;Check ((State).route -eq 'pages/ledger/index') 'Left tile opens ledger'
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().add();}'|Out-Null
 Eval 'function(){getCurrentPages().slice(-1)[0].getTabBar().chooseEntry({currentTarget:{dataset:{action:"item"}}});}'|Out-Null
 Shot item-destination;Check ((State).route -eq 'pages/editor/index') 'Right tile opens item editor'
 Check ((State).writes -eq 0) 'No backend writes'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;geometry=$m;fixtureOnly=$true;interaction='component handlers in native runtime'} -Depth 14));Write-Output "Passed $($checks.Count) native checks"
}catch{[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 12));throw}finally{
 Run restore|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
}
