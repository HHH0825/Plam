$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/motion-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/motion-20261018'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'motion-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run state;Check ($s.route -eq 'pages/items/index' -and !$s.error) 'Isolated items page loads' $s
$s=Run fold;Check ($s.open -and !$s.final -and $s.latest -and $s.height -gt 60 -and $s.jobs -eq 0 -and !$s.error) 'Fold opens, reverses quickly and settles without jobs' $s;Shot ledger-tools
$s=Run statistics;Check ($s.items -and $s.hidden -and $s.view -eq 'cash' -and $s.summary -and !$s.error) 'Rapid statistics pane switching preserves cash view and scope' $s;Shot statistics
$s=Run menu;Check ($s.menuOpen -and $s.route -eq 'pages/ledger-record/index' -and $s.categories -eq 8 -and $s.selected -eq 'bonus' -and !$s.error) 'Native add menu navigates without extra animation delay' $s;Shot income
$s=Run books;Check ($s.open -and $s.preview -eq '春日的小收藏' -and $s.closing -eq 'bookSheetOpen' -and $s.closed -and $s.inset -eq 0 -and !$s.error) 'Book draft, Chinese input and keyboard state survive animation' $s
$s=Run budget;Check ($s.kept -and $s.closing -eq 'budgetSheetOpen' -and $s.closed -and $s.inset -eq 0 -and !$s.error) 'Budget cancellation keeps its draft before confirmed close' $s
$s=Run growth;Check ($s.open -and $s.count -eq 5 -and $s.closing -eq 'growthOpen' -and $s.closed -and $s.jobs -eq 0 -and !$s.error) 'Collection closes once after repeated taps' $s
Run growth-shot|Out-Null;Shot collection
$s=Run announcement;Check ($s.closing -and $s.flight -match '--notice-dy' -and $s.closed -and !$s.error) 'Existing envelope close remains independent' $s
$s=Run account;Check ($s.jobs -eq 0 -and !$s.expanded -and !$s.loading -and !$s.error) 'Account switch clears animation and preference state' $s;Shot me
$s=Run repeat;Check (!$s.error -and $s.reads -lt 40) 'Repeated tab switches reuse display reads in the native runtime' $s
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
Write-Output "Passed $($checks.Count) isolated motion cases"
