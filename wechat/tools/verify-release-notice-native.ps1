$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/release-notice-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/release-notice-20261018'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'release-notice-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run state;Check ($s.route -eq 'pages/items/index' -and $s.unread -and !$s.open -and $s.entryCount -eq 1) 'Unread badge appears without automatic popup' $s;Shot unread
$s=Run filter;Check ($s.filterOpen -and !$s.open -and $s.unread) 'Filter blocks opening and does not acknowledge notice' $s
Run filter-close|Out-Null
$s=Run greeting-block;Check ($s.blocked -and $s.unread) 'Daily greeting and update notice cannot overlap' $s
$s=Run open;Check ($s.open -and !$s.unread -and $s.noticeTitle) 'Successful render immediately marks notice read' $s;Shot announcement
$s=Run close;Check (!$s.open -and !$s.unread -and $s.closing -and $s.flight -match '--notice-dy') 'Envelope returns to the measured icon on close' $s;Shot read
$s=Run open;Check ($s.open -and !$s.unread) 'Read notice can still be reopened manually' $s
Run close|Out-Null
$s=Run me;Check ($s.supportCount -eq 0 -and $s.feedbackCount -eq 1) 'Support menu removed while feedback remains' $s;Shot me
$s=Run items;Check (!$s.open -and !$s.unread) 'Returning to items keeps its read state' $s
$s=Run bob;Check (!$s.open -and $s.unread) 'New account has independent unread state' $s
$s=Run archive;Check ($s.entryCount -eq 0) 'Disposed archive has no update notice entry' $s
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
Write-Output "Passed $($checks.Count) isolated update notice cases"
