$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/beauty-icons-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/beauty-icons-20261018'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'beauty-icons-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);if($raw.IndexOf('{') -lt 0){throw $raw};$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action) -Compress));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
$s=Run picker;Check (!$s.capacityBlocked -and $s.total -eq 100 -and $s.daily -eq 24 -and $s.result -eq '口红' -and $s.selected -eq 'lipstick' -and $s.version -eq 3 -and $s.enabled) 'Version 3 shows 100 icons; daily group and lip-balm alias select lipstick' $s;Shot picker
$s=Run apply;Check ($s.cancelled -and $s.key -eq 'compact' -and $s.art -match 'compact.png' -and $s.categoryUnchanged -and $s.typeUnchanged -and $s.closed) 'Cancel preserves form; powder compact confirmation updates preview and isolated draft' $s;Shot editor
$s=Run version2;Check ($s.total -eq 90 -and $s.daily -eq 14 -and $s.blocked -and $s.version -eq 2 -and $s.note -and $s.oldIcon -eq 'perfume') 'Version 2 retains 90 icons and prevents cosmetics selection' $s;Shot version2
$s=Run version1;Check ($s.total -eq 40 -and $s.blocked -and $s.version -eq 1 -and $s.note -and $s.oldIcon -eq 'camera') 'Version 1 retains 40 icons and original cover confirmation' $s;Shot version1
$s=Run retry;Check ($s.key -eq 'sheet-mask' -and $s.version -eq 3 -and $s.art -match 'sheet-mask.png') 'Capability refresh unlocks mask alias and new cover rendering' $s
$s=Run account;Check ($s.closed -and $s.rows -eq 0 -and !$s.key -and $s.disabled -and $s.note) 'Account switch clears window, selection and capabilities' $s
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;compiledRuntime=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
Write-Output "Passed $($checks.Count) isolated beauty icon cases"
