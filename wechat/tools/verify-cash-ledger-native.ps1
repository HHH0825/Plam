$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/cash-ledger-20261013'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'cash-ledger-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Depth 25 -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$label){if(!$condition){throw $label};$checks.Add($label)}
$compiled=@()
foreach($name in @('ledger','statistics','ledger-record','ledger-detail','ledger-history','editor')){foreach($extension in @('wxml','wxss')){$compiled+=Ide ('compile_'+$extension) @('--file-path',"pages/$name/index.$extension")}}
$fixtures=(& node -e "console.log(JSON.stringify(require('./wechat/tools/cash-ledger-fixtures.cjs')))"|Out-String)|ConvertFrom-Json
try{
 Run setup $fixtures|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/ledger/index','--wait','1')|Out-Null
 $s=Run state;Check ($s.enabled -and $s.rows -gt 0 -and !$s.error) 'Ledger loads actual template and fixture entries';Check ($s.bar.selectedRoute -eq 'pages/ledger/index') 'Ledger selected by route';Shot ledger;$lg=Run geometry;Check ([Math]::Abs($lg.row.width-($lg.page.width-36)) -lt 1) 'Ledger rows fill content width'
 Run large|Out-Null;Shot ledger-extreme
 Run filter|Out-Null;$s=Run state;Check $s.bar.hidden 'Filter suppresses navigation';Shot ledger-filter
 Ide automation_navigate @('--action','switchTab','--url','/pages/statistics/index','--wait','1')|Out-Null
 $s=Run state;Check ($s.enabled -and !$s.error -and $s.bar.selectedRoute -eq 'pages/statistics/index') 'Statistics data and navigation';Shot statistics
 Ide automation_navigate @('--action','navigateTo','--url','/pages/ledger-record/index','--wait','1')|Out-Null
 $s=Run state;Check ($s.ready -and !$s.error) 'Record form opened';Run record-fill|Out-Null;Shot ledger-record;$g=Run geometry
 Check (!$g.unavailable -and $g.categories.Count -eq 8) 'Eight expense category buttons rendered'
 Check ([Math]::Abs($g.save.width-($g.page.width-36)) -lt 1) 'Save button fills form width'
 Check (@($g.categories|Where-Object {$_.width -lt 44 -or $_.height -lt 44}).Count -eq 0) 'Category touch targets at least 44px'
 Check (@($g.categories|Where-Object {$_.right -gt $g.page.right -or $_.left -lt $g.page.left}).Count -eq 0) 'Category buttons stay inside page'
 Check ($g.categories[0].right -le $g.categories[1].left -and $g.categories[1].right -le $g.categories[2].left) 'Four category columns do not overlap'
 Run clear-draft|Out-Null
 Ide automation_navigate @('--action','navigateBack','--wait','1')|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url',('/pages/ledger-detail/index?id='+('c'*32)),'--wait','1')|Out-Null
 $s=Run state;Check (!$s.error) 'Automatic entry detail and refund list';Shot ledger-detail
 Ide automation_navigate @('--action','navigateBack','--wait','1')|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url','/pages/ledger-history/index','--wait','1')|Out-Null
 $s=Run state;Check ($s.rows -eq 2 -and !$s.error) 'History candidates loaded';Run history-select|Out-Null;$s=Run state;Check ($s.selectedCount -eq 1) 'Purchase payment choice selects candidate';Shot ledger-history;$hg=Run geometry;Check ($hg.checks[0].width -eq 44) 'History check button is 44px'
 Check ($s.writes -eq 0) 'Zero attempted business writes'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;compiledFiles=$compiled.Count;geometry=$g;fixtureOnly=$true;remoteWrites=0;interaction='native runtime handlers; physical gestures not tested'} -Depth 18));Write-Output "Passed $($checks.Count) native checks; compiled $($compiled.Count) files"
}catch{[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 12));throw}finally{
 Run clear-draft|Out-Null;Run restore|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 Write-Output 'Original account, storage and transport restored'
}
