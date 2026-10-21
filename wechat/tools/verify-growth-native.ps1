$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/growth-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/growth-20261018'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'growth-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run layout;Check ($s.route -eq 'pages/rewards/index' -and $s.balance -eq 120 -and $s.rows -eq 4 -and $s.count -eq 5) 'Growth progress and sequential week render' $s;Shot shop
$s=Run claim;Check ($s.balance -eq 140 -and $s.claimed) 'Manual achievement claim updates wallet' $s
$s=Run claim;Check ($s.balance -eq 140) 'Repeated claim does not credit twice' $s
Run scroll|Out-Null;Shot growth-claimed
$s=Run items;Check ($s.tab -eq 'items' -and $s.rows -eq 5) 'Item achievement category renders' $s;Shot growth-items
$s=Run ledger;Check ($s.tab -eq 'ledger' -and $s.rows -eq 5) 'Ledger achievement category renders' $s
$s=Run ad;Check ($s.balance -eq 140 -and $s.ads.used_today -eq 0 -and $s.ads.daily_limit -eq 3) 'Unavailable ad does not pay or count views' $s
$s=Run switch;Check ($s.balance -eq 120 -and !$s.claimed -and $s.tab -eq 'visits') 'Account switch isolates claim state and category' $s
$s=Run member;Check ($s.plans -eq 2 -and $s.feedback -and $s.feedback -notmatch '初创|截止|特惠') 'Membership preserves two plans and generic announcement' $s;Shot membership
$s=Run notice;Check ($s.announcementOpen) 'Announcement still opens' $s;Shot announcement
$s=Run close-notice;Check (!$s.announcementOpen) 'Envelope animation closes announcement' $s
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
Write-Output "Passed $($checks.Count) isolated WeChat runtime cases"
