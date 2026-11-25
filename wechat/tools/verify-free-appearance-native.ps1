$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/free-appearance-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/free-appearance-20261017'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'free-appearance-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
try{
 $s=Run open @{url='/pages/member-tools/index?mode=books';kind='active'};Check (!$s.error -and $s.analysisRemoved -and $s.tagsRemoved) 'Books load without retired tag or analysis code' $s;Shot books
 $s=Run book-tab entries;Check ($s.bookTab -eq 'entries') 'Two-tab entries mode and new filter arrow' $s;Shot entries
 Run book-tab list|Out-Null;Run sort-start|Out-Null;Run sort-step @{index=0;step=1}|Out-Null
 $s=Run sort-save;Check (!$s.sorting -and $s.bookIds[1] -eq 'default') 'Whole-list ordering remains functional' $s
 $s=Run open @{url='/pages/member-tools/index?mode=budgets&month=2026-10';kind='active'};Check (!$s.error) 'Budget still loads after shared helper cleanup' $s;Shot budget
 $s=Run open @{url='/pages/member-tools/index?mode=analysis';kind='active'};Check ($s.retired) 'Retired analysis deep link offers return' $s;Shot retired-analysis
 $s=Run open @{url='/pages/statistics/index';kind='active'}
 $s=Run layout;Check (!$s.error -and $s.layout.toolbarCount -eq 1 -and $s.layout.toolbarTop -ge $s.layout.mainBottom) 'Cash toolbar appears below cash-item selector' $s;Shot statistics-cash
 $s=Run select-default;Check ($s.selectedBook -eq 'default') 'Cash book selection remains active' $s
 Run member-error|Out-Null;$s=Run pane items;Check ($s.view -eq 'items' -and $s.itemStats -and $s.layout.toolbarCount -eq 0 -and $s.layout.errorCount -eq 0) 'Items has no member toolbar or retry gap' $s;Shot statistics-items
 $s=Run pane cash;Check ($s.selectedBook -eq 'default' -and $s.layout.toolbarCount -eq 1) 'Returning to cash retains selected book' $s;Shot statistics-returned
 $s=Run open @{url='/pages/ledger/index';kind='free'};Check (!$s.error -and $s.budgetCard.kind -eq 'ready') 'Integrated ledger toolbar and configured budget card load for free account' $s;Shot ledger
 $s=Run open @{url='/pages/member-tools/index?mode=budgets&month=2026-10';kind='active'};Run budget-editor|Out-Null;$s=Run budget-empty;Check ($s.budgetSheetOpen -and $s.budgetInputs.Count -gt 1 -and @($s.budgetInputs|Where-Object {$_.height -ne 44}).Count -eq 0) 'Budget total and category inputs share fixed height' $s;Shot budget-sheet
 $s=Run budget-keyboard 280;Check ($s.budgetKeyboardInset -ge 0) 'Single budget keyboard avoidance with draft preserved' $s;Run budget-keyboard 0|Out-Null
 $s=Run open @{url='/pages/member-tools/index?mode=appearance';kind='error'};Check (!$s.error -and $s.appearance.theme) 'Free appearance loads even if membership lookup fails' $s;Shot appearance-free
 Run appearance-draft blue|Out-Null;$s=Run appearance-apply;Check (!$s.error -and !$s.appearanceDirty -and $s.appearance.theme -eq 'blue') 'Free account applies appearance in isolated memory only' $s;Shot appearance-applied
 $s=Run appearance-tab cash;Check (!$s.previewError -and $s.previewPath) 'Free cash report uses the shared preview renderer' $s;Shot appearance-cash
 $s=Run appearance-tab collection;Check (!$s.previewError -and $s.previewPath) 'Free collection report uses the shared preview renderer' $s;Shot appearance-collection
 $fixture=Get-Content (Join-Path $PSScriptRoot '../../test-results/free-appearance-fixture.json') -Raw -Encoding UTF8|ConvertFrom-Json
 $s=Run open @{url=('/pages/ledger-detail/index?id='+$fixture.detailId);kind='active'};Check (!$s.error) 'Ledger detail loads with plain source text' $s;Shot detail
 $s=Run open @{url='/pages/membership/index';kind='active'};Check ($s.featureCount -eq 2 -and !$s.error) 'Membership has only the two tool features' $s;Shot membership
 $s=Run open @{url='/pages/member-benefits/index';kind='free'};Check ($s.memberFeatures.Count -eq 3) 'Comparison removes custom analysis only' $s;Shot comparison
 $s=Run open @{url='/pages/me/index';kind='active'};Check ($s.tools.Count -eq 2) 'My page contains two member tools' $s;Run fold-tools|Out-Null;Shot me
 [IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
 Write-Output "Passed $($checks.Count) isolated WeChat runtime checks"
}finally{Run restore|Out-Null}
