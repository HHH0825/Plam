$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/compact-tools-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/compact-tools-20261017'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'compact-tools-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
try{
 $s=Run open @{url='/pages/ledger/index';kind='active'};Check ($s.folded -and !$s.error) 'Ledger starts folded with no budget occupying the top' $s;Shot ledger-closed
 $s=Run fold-account-tools;Check (!$s.folded) 'Ledger tools expand without resetting data' $s;Shot ledger-open
 $s=Run select-default;Check ($s.selectedBook -eq 'default' -and $s.foldHint -match '日常账本') 'Selected book stays visible in header' $s
 $s=Run fold-account-tools;Check ($s.folded -and $s.selectedBook -eq 'default') 'Folding preserves current book scope' $s;Shot ledger-filtered
 $s=Run open @{url='/pages/statistics/index';kind='active'};$s=Run layout;Check ($s.folded -and $s.layout.toolbarCount -eq 0 -and $s.layout.foldCount -eq 1 -and $s.layout.foldHeight -ge 44) 'Statistics fold preference starts independently' $s;Shot statistics-closed
 $s=Run fold-account-tools;Check (!$s.folded -and $s.layout.toolbarCount -eq 1 -and $s.layout.toolbarTop -ge $s.layout.mainBottom) 'Statistics expands below view switch' $s;Shot statistics-open
 Run select-default|Out-Null;Run member-error|Out-Null;$s=Run pane items;Check ($s.layout.foldCount -eq 0 -and $s.layout.toolbarCount -eq 0 -and $s.layout.errorCount -eq 0 -and $s.itemStats) 'Items hides the complete fold group and related errors' $s;Shot statistics-items
 $s=Run pane cash;Check (!$s.folded -and $s.selectedBook -eq 'default') 'Returning to cash preserves expansion and selected book' $s
 $s=Run open @{url='/pages/ledger/index';kind='active'};Check ($s.folded) 'Returning to ledger preserves its separate folded preference' $s
 $s=Run open @{url='/pages/member-tools/index?mode=appearance';kind='free'};Check (!$s.error -and $s.appearance.sticker -eq $null) 'Free appearance has no sticker draft state' $s;Shot appearance
 Run appearance-draft blue|Out-Null;$s=Run appearance-apply;Check (!$s.error -and !$s.appearanceDirty -and $s.appearance.theme -eq 'blue') 'Color and template still apply in isolated memory' $s
 $s=Run appearance-tab cash;Check (!$s.previewError -and $s.previewPath) 'Cash report still renders without extra stickers' $s;Shot appearance-cash
 $s=Run appearance-tab collection;Check (!$s.previewError -and $s.previewPath) 'Collection report still renders without extra stickers' $s;Shot appearance-collection
 foreach($kind in @('free','active','expired','error','unsupported')){
  $s=Run open @{url='/pages/me/index';kind=$kind};Run profile-top|Out-Null;Check ($s.identityKind -eq $kind) ('Compact identity reflects '+$kind) $s;Shot ('me-'+$kind)
 }
 [IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
 Write-Output "Passed $($checks.Count) isolated WeChat runtime checks"
}finally{Run restore|Out-Null}
