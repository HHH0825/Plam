param([string]$OutputDirectory='./wechat/docs/images/membership-tools-20261015')
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/member-tools-native-project'))
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){
 $raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String)
 $result=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$result.ok -or !$result.result.success){throw $raw}
 return $result.result
}
foreach($kind in @('expired','error','unsupported')){
 Ide simulator_open_page @('--page','pages/me/index','--query',('qaState='+$kind))|Out-Null
 $shot=Ide simulator_screenshot @('--path',(Join-Path $OutputDirectory ('me-'+$kind+'-native.png')),'--optimize','false','--wait','1')
 $checks.Add(@{page='pages/me/index';fixture=$kind;screenshot=$shot.path})
}
foreach($mode in @('books','analysis','budgets','appearance')){
 Ide simulator_open_page @('--page','pages/member-tools/index','--query',('mode='+$mode))|Out-Null
 $shot=Ide simulator_screenshot @('--path',(Join-Path $OutputDirectory ('tool-'+$mode+'-free-native.png')),'--optimize','false','--wait','1')
 $checks.Add(@{page='pages/member-tools/index';fixture='free';mode=$mode;screenshot=$shot.path})
}
$report=@{source='isolated offline project in WeChat developer tools';captures=$checks;realAccountAccess=$false;businessWrites=0;payments=0;interactionAutomation='unavailable: automator connection timed out; route actions covered by Node tests';manualVisualReview='pending'}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'native-sandbox-results.json'),($report|ConvertTo-Json -Depth 10))
Write-Output ('Captured '+$checks.Count+' isolated native screens.')
