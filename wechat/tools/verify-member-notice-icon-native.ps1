$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/member-notice-icon-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/member-notice-icon-20261017'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-announcement-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
Ide simulator_open_page @('--page','pages/membership/index')|Out-Null
Run open @{kind='free'}|Out-Null;$s=Run close
Check (!$s.open -and $s.layout.entry.Count -eq 1 -and $s.layout.entry[0].height -ge 44) 'Title notice icon remains a 44px touch target' $s;Shot free
$s=Run reopen;Check ($s.open -and $s.layout.window.Count -eq 1) 'Title icon opens announcement' $s
Run close|Out-Null
$s=Run open @{kind='active'};Check ($s.active -and !$s.open -and $s.plans.Count -eq 2) 'Active membership shows gold identity with two owned plans' $s;Shot active
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 15))
Write-Output "Passed $($checks.Count) offline WeChat checks"
