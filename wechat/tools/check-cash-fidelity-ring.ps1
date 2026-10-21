$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/cash-fidelity-20261014'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'cash-fidelity-native-check.js')).Replace("`r",'').Replace("`n",' ')
function Ide([string]$tool,[string[]]$flags){$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$argsFile=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 30));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$argsFile)).result.result}
$fixture=(& node (Join-Path $PSScriptRoot 'cash-redesign-native-fixture.cjs')|Out-String)|ConvertFrom-Json
try{
 Run setup $fixture|Out-Null
 Ide automation_navigate @('--action','navigateTo','--url','/pages/ledger-report/index?month=2026-10','--wait','1')|Out-Null
 Run wait-route 'pages/ledger-report/index'|Out-Null;Run settle|Out-Null
 $result=Run ring-debug
 [IO.File]::WriteAllText((Join-Path $output 'ring-diagnostics.json'),(ConvertTo-Json -InputObject $result -Depth 20))
 Ide simulator_screenshot @('--path',(Join-Path $output 'ring-diagnostic-native.png'),'--optimize','false','--wait','1')|Out-Null
 $result|ConvertTo-Json -Depth 12
}finally{Run restore|Out-Null;Ide automation_navigate @('--action','switchTab','--url','/pages/items/index','--wait','1')|Out-Null}
