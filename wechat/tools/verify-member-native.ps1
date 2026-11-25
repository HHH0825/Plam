param([switch]$CompileOnly,[switch]$SkipCompile,[string]$OutputDirectory)
$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/membership-20261015'))
if($OutputDirectory){$output=[IO.Path]::GetFullPath($OutputDirectory)}
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$argsFile=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 40));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$argsFile)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$label){if(!$condition){[IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json @{passed=$false;failedCheck=$label;checks=$checks;state=(Run state);fixtureOnly=$true;deployed=$false;realDeviceTested=$false} -Depth 30));throw $label};$checks.Add($label)}
function Open([string]$path){Run navigate $path|Out-Null;Run settle|Out-Null}
$fixture=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../../test-results/member-fixture.json'),[Text.Encoding]::UTF8) | ConvertFrom-Json
$compiled=0
$compileChecks=[System.Collections.Generic.List[object]]::new()
if($SkipCompile){$last=Get-Content (Join-Path $output 'compile-results.json') -Raw|ConvertFrom-Json;if(!$last.passed){throw 'No successful local compile evidence'};$compiled=$last.compiledFiles}else{
foreach($file in @('pages/membership/index','pages/member-tools/index','pages/me/index','pages/ledger/index','pages/statistics/index','pages/monthly/index','pages/ledger-report/index','pages/ledger-record/index','pages/ledger-detail/index','pages/fixed-expenses/index','custom-tab-bar/index')){foreach($ext in @('wxml','wxss')){
 try{Ide ('compile_'+$ext) @('--file-path',"$file.$ext")|Out-Null;$compiled++;$compileChecks.Add(@{file="$file.$ext";passed=$true})}
 catch{$compileChecks.Add(@{file="$file.$ext";passed=$false;error=$_.Exception.Message});[IO.File]::WriteAllText((Join-Path $output 'compile-results.json'),(ConvertTo-Json @{passed=$false;compiledFiles=$compiled;checks=$compileChecks;deployed=$false} -Depth 10));throw}
 [IO.File]::WriteAllText((Join-Path $output 'compile-results.json'),(ConvertTo-Json @{passed=($compiled -eq 22);compiledFiles=$compiled;checks=$compileChecks;deployed=$false} -Depth 10))
}}
}
if($CompileOnly){[IO.File]::WriteAllText((Join-Path $output 'compile-results.json'),(ConvertTo-Json @{passed=$true;compiledFiles=$compiled;deployed=$false}));Write-Output "Compiled $compiled local templates and styles";exit}
$original=(Ide automation_evaluate @('--fn-source','function(){return getCurrentPages().slice(-1)[0].route}')).result.result
try{
 Run setup $fixture|Out-Null
 Open '/pages/membership/index'
 Run free|Out-Null;Run settle|Out-Null;$s=Run state
 Check (!$s.error -and $s.selected -eq 'year' -and !$s.membership.payment_open -and $s.plans.Count -eq 3) 'Three plans, year selected, subscription closed'
 Shot subscription-free;Run bottom|Out-Null;Shot subscription-rights
 Run top|Out-Null;Run select month|Out-Null;Check ((Run state).selected -eq 'month') 'Plan selection updates without purchase'
 Run active|Out-Null;Run settle|Out-Null;Shot subscription-member
 Run expired|Out-Null;Run settle|Out-Null;$s=Run state
 Check (!$s.membership.active -and $s.membership.status -eq 'expired' -and $s.membership.expires_at) 'Expired status retains its expiry date';Shot subscription-expired
 Run active|Out-Null;Run settle|Out-Null
 foreach($mode in @('books','analysis','budgets','appearance')){
  Run open-feature $mode|Out-Null;Run settle|Out-Null
  Check ((Run state).route -eq 'pages/member-tools/index') ('Rights card opens '+$mode)
  Open '/pages/membership/index'
 }
 Open '/pages/me/index';Shot me-entry
 Run open-entry|Out-Null;Run settle|Out-Null
 Check ((Run state).route -eq 'pages/membership/index') 'My page membership ticket opens subscription'
 Open '/pages/member-tools/index?mode=books';$s=Run state
 Check (!$s.error -and $s.books.Count -eq 2 -and $s.entries.Count -eq 3) 'Books and independent ledger metadata render';Shot books
 Open '/pages/member-tools/index?mode=analysis';Run analysis|Out-Null;Run settle|Out-Null;Run bottom|Out-Null;$s=Run state
 Check (!$s.error -and $s.analysis.summary.net_expense_cents -eq 42000 -and $s.analysis.delta_percent -eq $null) 'Advanced analysis and zero baseline agree with API';Shot analysis-results
 Open '/pages/member-tools/index?mode=budgets&month=2026-10&book_id=all';$s=Run state
 Check (!$s.error -and $s.budget.total.used_cents -eq 42000 -and $s.budget.total.remaining_cents -eq 158000) 'Budget uses actual refund adjusted cash';Shot budgets
 Open '/pages/member-tools/index?mode=appearance';Run preview|Out-Null;Shot appearance
 Run theme sage|Out-Null
 Open '/pages/ledger-report/index?month=2026-10';Run settle|Out-Null;$s=Run state
 Check (!$s.error -and $s.layout.nodes.Count -gt 0) 'Member cash report preview renders';Shot cash-report
 $export=Run export;[IO.File]::WriteAllBytes((Join-Path $output 'cash-report-export.png'),[Convert]::FromBase64String($export.base64))
 Open '/pages/monthly/index?month=2026-10';Run settle|Out-Null;$s=Run state
 Check (!$s.error -and $s.memberReportPath) 'Member collection report uses export layout';Shot collection-report
 $export=Run export;[IO.File]::WriteAllBytes((Join-Path $output 'collection-report-export.png'),[Convert]::FromBase64String($export.base64))
 Check ((Run state).writes -eq 0) 'No business writes, payment or real sharing'
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;compiledFiles=$compiled;fixtureOnly=$true;remoteWrites=0;deployed=$false;realDeviceTested=$false} -Depth 20))
 Write-Output "Passed $($checks.Count) native checks"
}finally{
 Run restore|Out-Null
 if($original -in @('pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index')){Ide automation_navigate @('--action','switchTab','--url',('/'+$original),'--wait','1')|Out-Null}
 Write-Output 'Original account, storage and transport restored'
}
