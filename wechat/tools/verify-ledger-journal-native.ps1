$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/ledger-journal-20261013'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ledger-journal-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Depth 25 -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$label){if(!$condition){throw $label};$checks.Add($label)}
$compiled=@()
foreach($name in @('ledger','statistics')){foreach($ext in @('wxml','wxss')){$compiled+=Ide ('compile_'+$ext) @('--file-path',"pages/$name/index.$ext")}}
# The project must have settled after a refresh before installing the fixture.
# Read-only compiler checks above do not restart the running app.
$fixtures=(& node -e "console.log(JSON.stringify(require('./wechat/tools/ledger-journal-fixtures.cjs')))"|Out-String)|ConvertFrom-Json
try{
 Run setup $fixtures|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/ledger/index','--wait','1')|Out-Null
 $s=Run state;Check ($s.enabled -and $s.rows -gt 0 -and !$s.error) 'Month panel and grouped flows load';Shot ledger
 $lg=Run journal-geometry;Check (!$lg.unavailable -and $lg.panel.height -gt 0) 'Journal panel rendered'
 Check ($lg.icons.Count -eq 2 -and @($lg.icons|Where-Object {$_.width -lt 44 -or $_.height -lt 44}).Count -eq 0) 'Search and filter have 44px targets'
 Run filter|Out-Null;Check (Run state).bar.hidden 'Filter hides bottom navigation';Shot ledger-filter
 Run cancel-filter|Out-Null;Check ((Run state).kindIndex -eq 0) 'Cancel preserves applied filter'
 Run search|Out-Null;Shot ledger-search;Check ((Run state).query -eq '午餐') 'Compact search entry works'
 Ide automation_navigate @('--action','switchTab','--url','/pages/statistics/index','--wait','1')|Out-Null
 $s=Run state;Check ($s.enabled -and !$s.error -and !$s.dayError -and $s.calendarDays -eq 31) 'Native calendar loads all days and day-scoped API';Check ($s.selectedDate -eq '2026-10-13' -and $s.dayRows -eq 3) 'Today selected with three matching entries';Shot statistics
 $g=Run journal-geometry;Check (!$g.unavailable -and $g.days.Count -eq 31) 'Calendar geometry measured'
 Check (@($g.days|Where-Object {$_.width -lt 43.9 -or $_.height -lt 44 -or $_.right -gt $g.page.right}).Count -eq 0) 'All date targets fit and are at least 44px'
 Run select-date '2026-10-12'|Out-Null;Shot statistics-refund
 $s=Run state;Check ($s.selectedDate -eq '2026-10-12' -and $s.dayRows -eq 2 -and !$s.dayError) 'Date selection loads only matching refund and spend'
 Check ($s.writes -eq 0) 'No attempted business writes'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;compiledFiles=$compiled.Count;geometry=$g;ledgerGeometry=$lg;fixtureOnly=$true;remoteWrites=0;interaction='native runtime handlers, physical gestures pending'} -Depth 18));Write-Output "Passed $($checks.Count) native checks"
}catch{[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$false;checks=$checks;error=$_.Exception.Message} -Depth 12));throw}finally{
 Run restore|Out-Null
 Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null
 Write-Output 'Original account, storage and transport restored'
}
