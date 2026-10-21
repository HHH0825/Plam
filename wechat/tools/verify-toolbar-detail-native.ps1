$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/toolbar-detail-20261011'))
$scratch=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.qa-locations'))
$baseline=(Get-Content (Join-Path $PSScriptRoot 'purchases-native-check.js') -Raw -Encoding UTF8) -replace '\r?\n',' '
$source=(Get-Content (Join-Path $PSScriptRoot 'locations-native-check.js') -Raw -Encoding UTF8) -replace '\r?\n',' '
$checks=[System.Collections.Generic.List[string]]::new()
function Invoke-Ide([string]$tool,[string[]]$flags) {
  $raw=(& wechatide -c Codex $tool --project $project @flags | Out-String)
  $result=$raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
  if (!$result.ok -or !$result.result.success) { throw $raw }
  return $result.result
}
function Arguments($values) {
  $file=Join-Path $scratch 'native-args.json'
  [IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $values -Depth 20 -Compress))
  return $file
}
function Fixture([string]$action,[string]$code=$source) { $file=Arguments @($action);return (Invoke-Ide automation_evaluate @('--fn-source',$code,'--args-file',$file)).result.result }
function Method([string]$name,$values=@()) { $file=Arguments $values;Invoke-Ide automation_page_action @('--action','callMethod','--method',$name,'--args-file',$file) | Out-Null }
function Tap([string]$selector) { Invoke-Ide automation_element_action @('--action','tap','--selector',$selector,'--wait-for-selector',$selector) | Out-Null }
function Check([string]$key,$expected,[string]$description) {
 $file=Arguments @($key)
 $code="function(key){return new Promise(resolve=>setTimeout(()=>resolve(key.split('.').reduce((v,k)=>v && v[k],getCurrentPages().slice(-1)[0].data)),200));}"
 $result=(Invoke-Ide automation_evaluate @('--fn-source',$code,'--args-file',$file)).result.result
 if($result -ne $expected){throw "$description : expected $expected, got $result"};$checks.Add($description)
}
function Screenshot([string]$name,[string]$selector) {
 Invoke-Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait-for-selector',$selector) | Out-Null
 Write-Output "Screenshot: $name"
}
function Assert-Page([string]$path) {
 $file=Arguments @($path)
 $code="function(expected){return new Promise(resolve=>{const end=Date.now()+5000;const read=()=>{const p=getCurrentPages().slice(-1)[0];if(p.route===expected || Date.now()>end)resolve(p.route);else setTimeout(read,100);};read();});}"
 $route=(Invoke-Ide automation_evaluate @('--fn-source',$code,'--args-file',$file)).result.result
 if($route -ne $path){throw ('Unexpected page: '+$route+'; expected '+$path)}
}
function Read-Geometry {
 $code="function(){const p=getCurrentPages().slice(-1)[0];return new Promise(resolve=>{const q=wx.createSelectorQuery().in(p);['.purchase-entries','.wishlist-entry','.subscription-entry','.storage-entry','.filter-control','.filter-surface','.sort-picker','.sort-control','.cost-card','.facts','.detail-storage-row','.linked-expenses'].forEach(s=>q.select(s).boundingClientRect());q.exec(resolve);});}"
 return (Invoke-Ide automation_evaluate @('--fn-source',$code)).result.result
}
try {
 $save="function(){const app=getApp(),key='wwjCollection:'+app.globalData.user.id;app._toolbarPreferencesQA={key,value:wx.getStorageSync(key)};return true;}"
 Invoke-Ide automation_evaluate @('--fn-source',$save) | Out-Null
 Fixture setup $baseline | Out-Null;Fixture setup | Out-Null
 Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null
 Method load;Check 'items.0.id' 990001 'Only isolated memory examples appear'
 Method measureEntryLayout
 $rects=Read-Geometry
 $row=$rects[0];$a=$rects[1];$b=$rects[2];$c=$rects[3]
 if([Math]::Abs($a.width-$b.width) -gt 1 -or [Math]::Abs($b.width-$c.width) -gt 1 -or [Math]::Abs($row.left-$a.left) -gt 1 -or [Math]::Abs($row.right-$c.right) -gt 1 -or $a.top -ne $c.top){throw 'Entries do not equally fill the native row'}
 if($rects[4].height -lt 44 -or $rects[6].height -lt 44 -or [Math]::Abs($rects[5].height-36) -gt 1 -or [Math]::Abs($rects[7].height-36) -gt 1){throw ('Native surface/hit sizes incorrect: '+(ConvertTo-Json $rects -Compress))}
 $checks.Add('Three native entries equally fill one row; smaller surfaces retain 44px hit targets')
 Screenshot entries '.storage-entry'
 Tap '.wishlist-entry';Assert-Page 'pages/wishlist/index';Check 'loading' $false 'Wishlist entry still opens'
 Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null;Assert-Page 'pages/items/index'
 Tap '.subscription-entry';Assert-Page 'pages/fixed-expenses/index';Check 'loading' $false 'Subscription entry still opens'
 Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null;Assert-Page 'pages/items/index'
 Tap '.storage-entry';Assert-Page 'pages/storage-locations/index';Check 'locations.length' 2 'Storage entry still opens'
 Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null;Assert-Page 'pages/items/index'
 Tap '.filter-control';Check filterOpen $true 'Smaller filter button opens sheet'
 Screenshot filter '.sheet-apply';Method resetDraftFilters;Method applyFilters;Check filterOpen $false 'Filter reset and confirm remain usable'
 Method sortChange @(@{detail=@{value=1}});Check sortIndex 1 'Sorting still updates'
 Invoke-Ide automation_navigate @('--action','navigateTo','--url','/pages/item/index?id=990002') | Out-Null
 Check factsExpanded $false 'Basic facts start collapsed'
 $detail=Read-Geometry
 if($detail[10].top -lt $detail[9].bottom -or $detail[10].bottom -gt $detail[11].top){throw 'Native location position incorrect'}
 $checks.Add('Location follows basic facts even when folded')
 Screenshot detail-collapsed '.cost-frame'
 Tap '.fold-heading';Check factsExpanded $true 'Basic facts expand independently'
 $expanded=Read-Geometry
 if($expanded[10].top -lt $expanded[9].bottom){throw 'Location overlaps expanded facts'}
 Screenshot detail-expanded '.detail-storage-row'
 Method changeStorageLocation;Check assignItemId 990002 'Relocated change button still opens chooser'
 Invoke-Ide automation_navigate @('--action','redirectTo','--url','/pages/item/index?id=990002') | Out-Null
 Method costDecorFailed;Check costDecorError $true 'Decoration failure activates plain border fallback'
 Screenshot detail-fallback '.cost-card'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{checks=$checks;entryGeometry=$rects;collapsedGeometry=$detail;expandedGeometry=$expanded;fixtureOnly=$true;remoteWrites=0} -Depth 12))
 Write-Output "Passed $($checks.Count) native checks; remote writes: 0"
} finally {
 Fixture restore | Out-Null;Fixture restore $baseline | Out-Null
 $restore="function(){const app=getApp(),saved=app._toolbarPreferencesQA;if(saved){if(saved.value)wx.setStorageSync(saved.key,saved.value);else wx.removeStorageSync(saved.key);delete app._toolbarPreferencesQA;}return true;}"
 Invoke-Ide automation_evaluate @('--fn-source',$restore) | Out-Null
 Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null
 Write-Output 'Original transport restored'
}
