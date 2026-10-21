$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/member-letter-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/member-letter-20261017'))
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-letter-native.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[object]]::new()
function Ide([string]$tool,[string[]]$flags){Start-Sleep -Milliseconds 1800;$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Run([string]$action,$value=$null){$file=Join-Path $out 'native-args.json';[IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject @($action,$value) -Compress -Depth 10));return (Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
function Check($condition,[string]$name,$state){if(!$condition){throw ($name+' '+($state|ConvertTo-Json -Compress -Depth 8))};$checks.Add(@{name=$name;passed=$true;state=$state})}
try{
 Run open @{url='/pages/membership/index';kind='free'}|Out-Null;$s=Run letter-layout
 Check ($s.letterExpanded -and $s.letterLayout.windowCount -eq 1 -and $s.letterLayout.windowRight -lt $s.letterLayout.catLeft -and $s.letterLayout.bodyHeight -gt $s.letterLayout.scrollHeight) 'Letter opens beside cat with scrollable full text' $s;Shot open
 $openTop=$s.letterLayout.planTop;$s=Run fold-note
 Check (!$s.letterExpanded -and $s.letterLayout.peekCount -eq 1 -and $s.letterLayout.peekWidth -lt 180 -and $s.letterLayout.planTop -le $openTop-70) 'Collapsing replaces window with pill and raises plans' $s;Shot closed
 $s=Run fold-note;Check ($s.letterExpanded -and $s.letterLayout.windowCount -eq 1) 'Pill reopens the letter' $s
 $s=Run letter-after-offer;Check ($s.letterExpanded -and $s.letterLayout.windowCount -eq 1) 'Feedback letter remains after launch offer ends' $s;Shot after-offer
 Run open @{url='/pages/membership/index';kind='active'}|Out-Null;$s=Run letter-layout;Check ($s.memberActive -and $s.letterExpanded) 'Active membership retains owned status with letter' $s;Shot active
 Run open @{url='/pages/membership/index';kind='error'}|Out-Null;$s=Run letter-layout;Check ($s.error -and $s.letterLayout.windowCount -eq 0 -and $s.letterLayout.peekCount -eq 0) 'Failed status read does not expose stale letter content' $s;Shot error
 [IO.File]::WriteAllText((Join-Path $out 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;fixtureOnly=$true;cloudWrites=0;realPayments=0;realDevice=$false} -Depth 12))
 Write-Output "Passed $($checks.Count) isolated WeChat runtime checks"
}finally{Run restore|Out-Null}
