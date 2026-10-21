$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/discovery-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/discovery-journal-20261018'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'discovery-journal-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run entry;Check ($s.fullWidth -and $s.buttonHeight -ge 44 -and $s.removed -and $s.first -eq 'warranty_due' -and $s.items -eq 3 -and !$s.basis -and !$s.details -and !$s.trend -and $s.located -and !$s.error) 'Me entry removed, statistics reminder navigates and locates prioritized discovery' $s;Shot discovery
$s=Run expand;Check ($s.basis -and $s.count -eq 4 -and $s.details -and $s.trend -and $s.art -match 'type-digital') 'Basis, all associated items, expense details and trend expand' $s;Shot expanded
$s=Run refresh-failure;Check ($s.retained -and $s.error -and $s.recovered -and $s.basis -and $s.count -eq 4) 'Failed refresh retains results and expansion; direct retry recovers' $s
$s=Run return;Check ($s.monthly -eq 'pages/monthly/index' -and $s.route -eq 'pages/insights/index' -and $s.basis -and $s.details -and $s.count -eq 4) 'Monthly report navigation and return preserve explicit choices' $s
$s=Run account;Check ($s.reset -and $s.empty -and $s.error -and $s.reloaded -and $s.folded) 'Account switch clears prior results and folds before failed reads' $s
$s=Run fresh;Check ($s.defaultFolded -and $s.items -eq 3 -and $s.route -eq 'pages/insights/index') 'New page instance starts with default folded sections' $s
Run me-shot|Out-Null;Shot me
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
Write-Output "Passed $($checks.Count) isolated discovery cases"
