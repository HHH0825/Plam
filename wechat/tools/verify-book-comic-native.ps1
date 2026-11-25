$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/book-comic-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/book-comic-20261017'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'book-comic-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
try{
 $s=Run open @{url='/pages/member-tools/index?mode=books';kind='active'};Check (!$s.error -and $s.bookIds.Count -eq 4) 'Four books load original cover identifiers' $s;Shot books
 $original=$s.bookIds -join ','
 $s=Run sort-start;Check ($s.sorting -and !$s.sortDirty) 'Sort mode opens with no write' $s;Shot sorting
 $s=Run drag-preview @{from=0;to=1};Check ($s.dragId -eq 'default' -and $s.dragTarget -eq 1) 'Default book drag uses actual measured cards' $s;Shot dragging
 $s=Run drag-end;Check ($s.sortDirty -and $s.bookIds[1] -eq 'default') 'Drop updates only draft' $s
 $s=Run sort-cancel;Check (!$s.sorting -and ($s.bookIds -join ',') -eq $original) 'Cancel restores original order' $s
 Run sort-start|Out-Null;Run sort-step @{index=0;step=1}|Out-Null
 $s=Run sort-save;Check (!$s.sorting -and !$s.sortPending -and $s.bookIds[1] -eq 'default') 'Complete saves fixture order once' $s;Shot saved
 $s=Run open @{url='/pages/member-tools/index?mode=books';kind='active'};Check ($s.bookIds[1] -eq 'default') 'Reopening reads persisted fixture sequence' $s
 $s=Run book-editor;Check ($s.bookSheetOpen -and $s.bookPreview.name -eq '我的新账本') 'New book editor opens' $s;Shot book-editor
 foreach($i in 0..3){$s=Run book-cover $i;Check ($s.bookPreview.coverPath -match '/assets/book-comic/') ('Comic cover preview '+$i) $s;Shot ('book-cover-'+$i)}
 Run close-book|Out-Null
 $s=Run open @{url='/pages/member-tools/index?mode=books';kind='free'};Check (!$s.memberActive) 'Free user sees books without editable entitlement' $s
 $s=Run open @{url='/pages/member-tools/index?mode=appearance';kind='active'};Check (!$s.error) 'Report appearance still loads after book sticker removal' $s
 [IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
 Write-Output "Passed $($checks.Count) isolated WeChat runtime checks"
}finally{Run restore|Out-Null}
