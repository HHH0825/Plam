$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/rewards-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/rewards-20261017'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'rewards-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run layout
Check ($s.route -eq 'pages/rewards/index' -and $s.balance -eq 120 -and $s.days -eq 7 -and $s.layout.tiers -eq 5) 'Seven-day check-in and five shop tiers render' $s
Shot shop
$s=Run exchange;Check ($s.exchangeOpen -and $s.exchange.price -eq 60 -and $s.exchange.after -eq 21) 'Redemption preview uses current balance and capacity' $s;Shot exchange
$s=Run redeem;Check (!$s.exchangeOpen -and $s.extra -eq 1 -and $s.balance -eq 60) 'Redeeming one slot deducts exactly sixty seeds' $s
$s=Run checkin;Check ($s.claimed -and $s.balance -eq 70) 'Daily check-in adds Saturday reward' $s
$s=Run checkin;Check ($s.balance -eq 70) 'Repeated check-in does not add seeds' $s;Shot claimed
$s=Run history;Check ($s.historyOpen -and $s.historyRows -eq 2) 'Wallet history renders in the same page' $s;Shot history
Run history-close|Out-Null
$s=Run capacity;Check ($s.capacityOpen) 'Capacity dialog renders without another modal' $s;Shot capacity
Run capacity-close|Out-Null
$s=Run tab '/pages/items/index';Check ($s.greetingOpen -and $s.greeting.title) 'Daily greeting appears on a settled root page' $s;Shot greeting
$s=Run greeting-close;Check (!$s.greetingOpen) 'Close dismisses greeting without signing in' $s
$s=Run tab '/pages/me/index';Check (!$s.greetingOpen) 'Another tab does not repeat greeting today' $s;Shot me
$s=Run open '/pages/membership/index';Check ($s.plans -eq 2) 'Membership preserves two sale plans' $s
$s=Run active;Check ($s.memberActive -and $s.memberExpiry) 'Existing active membership still renders expiry' $s;Shot membership
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
Write-Output "Passed $($checks.Count) isolated WeChat runtime cases"
