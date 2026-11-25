$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/member-tools-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/member-details-20261016'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-details-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
try{
 $s=Run open @{url='/pages/member-tools/index?mode=books';kind='active'};Check (!$s.error) 'Books open with fixture' $s
 $s=Run book-editor;Check ($s.bookSheetOpen -and $s.bookPreview.name -eq '我的新账本') 'New book preview defaults' $s;Shot book-default
 $s=Run book-style;Check ($s.bookPreview.name -eq '周末旅行手记' -and $s.bookPreview.coverPath -match 'camera' -and $s.bookPreview.stickerPath) 'Draft book name cover sticker preview' $s;Shot book-preview
 $s=Run no-sticker;Check (!$s.bookPreview.stickerPath) 'Remove sticker from draft preview' $s
 $s=Run book-keyboard;Check ($s.keyboardInset -eq 300) 'Keyboard avoidance handler' $s;Shot book-keyboard-handler
 $s=Run close-book;Check (!$s.bookSheetOpen -and $s.keyboardInset -eq 0) 'Close clears keyboard state' $s
 $s=Run open @{url='/pages/member-tools/index?mode=appearance';kind='active'};Check (!$s.error -and $s.appearanceTab -eq 'page') 'Appearance starts on page options' $s;Shot appearance-page
 Run appearance-style|Out-Null
 $s=Run appearance-tab cash;Check (!$s.previewError -and $s.previewPath -and $s.appearanceDirty) 'Cash canvas preview renders shared draft' $s;Shot appearance-cash
 $s=Run appearance-tab collection;Check (!$s.previewError -and $s.previewPath -and $s.appearance.theme -eq 'sage') 'Collection preview retains shared style' $s;Shot appearance-collection
 $s=Run appearance-tab page;Check ($s.appearanceDirty -and $s.appearance.theme -eq 'sage') 'Page tab retains unapplied style' $s
 $s=Run open @{url='/pages/member-benefits/index';kind='free'};Check (!$s.error) 'Free user comparison loads' $s
 $s=Run service;Check ($s.terms.Count -eq 3 -and ($s.terms -join '') -notmatch 'App Store|安卓退款') 'Requested paragraph removed remaining terms preserved' $s;Shot comparison-terms
 $s=Run open @{url='/pages/me/index';kind='active'};Check (!$s.memberToolsExpanded -and $s.tools.Count -eq 4) 'Tools collapsed and four entries retained' $s;Shot me-collapsed
 $s=Run fold-tools;Check ($s.memberToolsExpanded) 'Tools expand' $s;Shot me-expanded
 [IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
 Write-Output "Passed $($checks.Count) isolated WeChat runtime checks"
}finally{Run restore|Out-Null}
