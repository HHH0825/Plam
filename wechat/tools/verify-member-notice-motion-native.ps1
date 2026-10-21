$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/member-notice-motion-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/member-notice-motion-20261017'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-announcement-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),'{"passed":false,"reason":"verification in progress"}')
Ide simulator_open_page @('--page','pages/membership/index')|Out-Null
Run open @{kind='free'}|Out-Null
$motionSource="async function(){if(getApp().globalData.token!=='isolated-native-member')throw Error('Offline only');const p=getCurrentPages().slice(-1)[0];await p.qaCloseMotion();return p.data.qaMotionResult}"
$s=(Ide automation_evaluate @('--fn-source',$motionSource)).result.result
Check ($s.closing -and $s.first -and $s.second -and $s.first.transform -ne $s.second.transform -and !$s.open -and $s.pulse) 'Native letter travels to actual title icon, closes and pulses' $s
Shot closed
$s=Run reopen;Check ($s.open -and $s.layout.window.Count -eq 1) 'Announcement remains reopenable after animation' $s
Shot open
$repeatSource="async function(){const p=getCurrentPages().slice(-1)[0];const rows=[];for(let i=0;i<2;i++){await p.qaCloseMotion();rows.push(p.data.qaMotionResult);await new Promise(r=>setTimeout(r,450))}return rows}"
$rows=(Ide automation_evaluate @('--fn-source',$repeatSource)).result.result
foreach($item in $rows){Check ($item.closing -and $item.first -and $item.second -and $item.first.transform -ne $item.second.transform -and !$item.open) 'Same-page repeat close continues to animate' $item}
[IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 15))
Write-Output "Passed $($checks.Count) offline WeChat checks"
