$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/member-announcement-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/member-announcement-20261017'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-announcement-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
Ide simulator_open_page @('--page','pages/membership/index')|Out-Null
$s=Run open @{kind='free'}
Check ($s.open -and $s.layout.window.Count -eq 1 -and $s.plans.Count -eq 2 -and $s.selected -eq 'month') 'First visit opens modal with month and quarter only' $s;Shot open
Check ($s.layout.close[0].height -ge 44 -and $s.layout.window[0].bottom -le 800) 'Dialog and close button fit viewport' $s
$top=$s.layout.plans[0].top;$s=Run close
Check (!$s.open -and $s.layout.window.Count -eq 0 -and $s.layout.entry[0].height -ge 44 -and [Math]::Abs($s.layout.plans[0].top-$top) -lt 1) 'Closing leaves compact announcement entry and unchanged layout' $s;Shot closed
$s=Run open @{kind='free'};Check (!$s.open) 'Reentering acknowledged account stays quiet' $s
$s=Run scroll-page;$scroll=$s.layout.plans[0].top;$s=Run reopen
Check ($s.open) 'Announcement button reopens dialog' $s
$s=Run close;Check ([Math]::Abs($s.layout.plans[0].top-$scroll) -lt 1) 'Closing retains page scroll position' $s
$s=Run account 777;Check ($s.open) 'New stable user ID gets its own first notice' $s
Run close|Out-Null
$s=Run open @{kind='active'};Check ($s.active -and !$s.open -and $s.plans.Count -eq 2) 'Active membership keeps owned plans and saved notice choice' $s;Shot active
Run open @{kind='after-offer'}|Out-Null;$s=Run reopen;Check ($s.open -and !$s.promotion) 'Post-promotion feedback remains accessible without expired offer' $s;Shot after-offer
Run close|Out-Null
$s=Run open @{kind='error'};Check ($s.error -and !$s.open -and $s.layout.window.Count -eq 0 -and $s.layout.entry.Count -eq 0) 'Failed read exposes no stale notice or member identity' $s;Shot error
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 15))
Write-Output "Passed $($checks.Count) offline WeChat checks"
