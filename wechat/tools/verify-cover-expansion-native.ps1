$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/cover-expansion-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/cover-expansion-20261018'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'cover-expansion-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run picker;Check (!$s.capacityBlocked -and $s.total -eq 90 -and $s.digital -eq 18 -and $s.result -eq '充电宝' -and $s.selected -eq 'power-bank' -and $s.version -eq 2 -and $s.enabled) 'Packed editor shows 90 icons, category and alias search select a new icon' $s;Shot picker
$s=Run apply;Check ($s.cancelled -and $s.key -eq 'keyboard' -and $s.art -match 'keyboard.png' -and $s.categoryUnchanged -and $s.typeUnchanged -and $s.closed) 'Cancel preserves the form; confirmed icon updates preview and isolated draft only' $s;Shot editor
$s=Run legacy;Check ($s.total -eq 40 -and $s.blocked -and $s.version -eq 1 -and $s.note -and $s.oldIcon -eq 'camera' -and $s.visible) 'Old service retains 40 covers, blocks new selection and still applies original icons' $s;Shot legacy
$s=Run retry;Check ($s.key -eq 'perfume' -and $s.version -eq 2 -and $s.art -match 'perfume.png') 'Capability retry unlocks new icons and aliases without reopening the page' $s
$s=Run account;Check ($s.closed -and $s.rows -eq 0 -and !$s.key -and $s.disabled -and $s.note) 'Account switch clears the icon window, preview selection and capability state' $s
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;compiledRuntime=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
Write-Output "Passed $($checks.Count) isolated cover expansion cases"
