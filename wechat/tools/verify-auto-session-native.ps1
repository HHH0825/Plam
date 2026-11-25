$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/auto-session-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/auto-session-20261025'))
[IO.Directory]::CreateDirectory($out)|Out-Null
& node (Join-Path $PSScriptRoot 'build-auto-session-native.cjs')
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../../test-results/auto-session-native-source.js'))
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags 2>&1|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run mode loading;Check ($s.offline -and $s.route -eq 'pages/items/index' -and $s.blocked -and $s.busy) 'Startup remains on items behind the connection skeleton' $s;Shot startup
$s=Run mode failure;Check ($s.blocked -and !$s.busy -and $s.error -and $s.route -eq 'pages/items/index') 'Failed login stays on items with explicit retry' $s;Shot failure
$s=Run retry;Check (!$s.blocked -and !$s.connectionBlocked -and $s.phase -eq 'ready' -and !$s.navHidden) 'Retry opens items and restores navigation without manual login' $s;Shot items
$s=Run about;Check ($s.route -eq 'pages/login/about' -and !$s.connectionBlocked) 'My settings opens public About using the approved artwork' $s;Shot about
Run bottom|Out-Null;Shot about-bottom
$s=Run profile;Check ($s.route -eq 'pages/profile/index' -and $s.loaded) 'Personal settings loads inside its subpackage' $s;Run bottom|Out-Null;Shot profile
$s=Run profile-recovery;Check ($s.name -eq '连接恢复后保留的填写' -and !$s.connectionBlocked -and $s.phase -eq 'ready') 'Same-account recovery retains unsaved personal settings' $s;Shot profile-recovered
@{passed=$true;checks=$checks;offlineApiFixtures=$true;realAuthApiTested=$false;realBusinessWrites=0;realDeviceTested=$false;computerUse=$false;deployed=$false;uploaded=$false}|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 (Join-Path $out 'native-results.json')
Write-Output "Passed $($checks.Count) native offline UI checks"
