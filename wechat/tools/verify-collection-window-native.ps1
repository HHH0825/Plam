$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/collection-window-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/collection-window-20261018'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'collection-window-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run entry;Check (!$s.open -and $s.balance -eq 120 -and $s.pending -eq 5) 'Single compact collection entry renders' $s;Shot entry
$s=Run open;Check ($s.open -and $s.rows -eq 4 -and $s.list.height -gt 100 -and $s.bounds.height -le 680) 'Window opens cached data and refreshes' $s;Shot window
$s=Run items;Check ($s.rows -eq 5 -and $s.tab -eq 'items') 'Five item achievements inside window' $s
Ide automation_element_action @('--action','scrollTo','--selector','.growth-scroll','--x','0','--y','250')|Out-Null
$s=Run scroll-check;Check ([Math]::Abs($s.header.top-$s.initial) -lt 2) 'Window heading stays fixed during list scroll' $s;Shot scrolled
$s=Run close;Check (!$s.open -and [Math]::Abs($s.scroll-$s.original) -lt 3) 'Close restores original page position' $s
$s=Run open;Check ($s.open -and $s.tab -eq 'items') 'Reopen preserves in-page category' $s
Run close|Out-Null
$s=Run error;Check ($s.open -and $s.windowError -and $s.balance -eq 120 -and $s.rows -eq 5) 'Failed refresh preserves cached progress inside window' $s;Shot error
$s=Run retry;Check (!$s.loading -and !$s.windowError -and $s.open) 'Window retry recovers without clearing progress' $s
$s=Run claim-close;Check ($s.closedWhileBusy -and !$s.open -and !$s.busy -and $s.balance -eq 140 -and $s.pending -eq 4 -and !$s.flash) 'Closing during claim updates wallet without reopening' $s
$s=Run open;Check ($s.open -and $s.claimed -eq 2) 'Reopen shows successful manual claim' $s
$s=Run repeat;Check ($s.balance -eq 140) 'Repeated claim remains deduplicated' $s
$s=Run switch;Check (!$s.open -and $s.tab -eq 'visits' -and $s.balance -eq 120 -and $s.pending -eq 5) 'Account switch closes window and isolates status' $s
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
Write-Output "Passed $($checks.Count) isolated collection window cases"
