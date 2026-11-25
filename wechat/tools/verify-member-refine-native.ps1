$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/member-tools-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/member-refine-20261016'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-refine-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
try{
 $s=Run open @{url='/pages/member-tools/index?mode=books';kind='active'};Check (!$s.error -and $s.bookTab -eq 'list') 'Books opens default list' $s;Shot books
 $s=Run book-tab entries;Check ($s.bookTab -eq 'entries') 'Entries tab opens' $s;Shot entries
 $s=Run book-tab tags;Check ($s.bookTab -eq 'tags') 'Tags tab opens' $s;Shot tags
 Run book-tab list|Out-Null;$s=Run book-editor;Check ($s.bookSheetOpen -and !$s.error) 'Book bottom editor opens' $s;Shot book-editor
 $s=Run open @{url='/pages/member-tools/index?mode=budgets&month=2026-10';kind='active'};Check (!$s.error) 'Budget loads actual fixture amounts' $s;Shot budget
 $s=Run budget-editor;Check ($s.budgetSheetOpen -and !$s.error) 'Budget bottom editor opens' $s;Shot budget-editor
 Run open @{url='/pages/member-tools/index?mode=budgets&month=2026-10';kind='active'}|Out-Null;$s=Run budget-copy;Check ($s.budgetDraftDirty -and $s.budgetSheetOpen -and !$s.error) 'Copy is an unapplied draft' $s;Shot budget-copy
 $s=Run open @{url='/pages/membership/index';kind='active'};Check ($s.startupExpanded -and !$s.error) 'Existing membership style starts with expanded note' $s;Shot membership
 $s=Run fold-note;Check (!$s.startupExpanded) 'Membership note collapses' $s;Shot membership-collapsed
 $s=Run open @{url='/pages/member-benefits/index';kind='free'};Check ($s.freeFeatures.Count -eq 6 -and $s.memberFeatures.Count -eq 5 -and !$s.error) 'Comparison is accessible to free users' $s;Shot comparison
 $s=Run service;Check ($s.serviceExpanded) 'Service terms expand' $s
 $s=Run open @{url='/pages/member-tools/index?mode=bills';kind='active'};Check ($s.retired) 'Retired deep link shows notice' $s;Shot retired-link
 $s=Run open @{url='/pages/me/index';kind='active'};Check ($s.tools.Count -eq 4 -and !$s.memberToolsExpanded) 'Four tools start collapsed' $s;Shot tools-collapsed
 $s=Run fold-tools;Check ($s.memberToolsExpanded) 'Round plus control expands tools' $s;Shot tools-expanded
 [IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
 Write-Output "Passed $($checks.Count) isolated WeChat runtime checks"
}finally{Run restore|Out-Null}
