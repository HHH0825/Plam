$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/month-arrows-20261014'))
[IO.Directory]::CreateDirectory($output)|Out-Null
function Ide([string]$tool,[string[]]$flags){$raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Eval([string]$fn){return (Ide automation_evaluate @('--fn-source',$fn)).result.result}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'.png')),'--optimize','false','--wait','1')|Out-Null}
$results=[System.Collections.Generic.List[object]]::new()
$original=Eval 'function(){return getCurrentPages().slice(-1)[0].route}'
$geometry="function(){const p=getCurrentPages().slice(-1)[0];return new Promise(resolve=>{wx.createSelectorQuery().in(p).selectAll('.ledger-month-arrow').boundingClientRect().select('.ledger-caret').boundingClientRect().exec(r=>resolve({month:p.data.month,canNext:p.data.canNext,buttons:r[0],caret:r[1]}))})}"
try{
 foreach($name in @('ledger','statistics')){
  foreach($ext in @('wxml','wxss')){Ide ('compile_'+$ext) @('--file-path',"pages/$name/index.$ext")|Out-Null}
  Ide automation_navigate @('--action','switchTab','--url',"/pages/$name/index",'--wait','2')|Out-Null
  Eval "function(){const p=getCurrentPages().slice(-1)[0];return new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(!p.data.loading){clearInterval(t);resolve(true)}else if(++n>30){clearInterval(t);reject(Error('Page did not finish loading'))}},200)})}"|Out-Null
  Shot ($name+'-current')
  $g=Eval $geometry
  if($g.buttons.Count -ne 2 -or !$g.caret){throw "$name month controls missing"}
  foreach($b in $g.buttons){if($b.width -lt 44 -or $b.height -lt 44){throw "$name unexpected month button size: $(ConvertTo-Json $b -Compress)"}}
  if($g.canNext){throw "$name expected current-month next to be disabled"}
  Eval 'function(){getCurrentPages().slice(-1)[0].previous();return true}'|Out-Null
  $previous=Eval $geometry
  if(!$previous.canNext -or $previous.month -eq $g.month){throw "$name previous month failed"}
  Eval 'function(){getCurrentPages().slice(-1)[0].next();return true}'|Out-Null
  $restored=Eval $geometry
  if($restored.month -ne $g.month -or $restored.canNext){throw "$name next month failed"}
  $results.Add(@{page=$name;current=$g;previous=$previous;restored=$restored;passed=$true})
 }
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{passed=$true;compiledFiles=4;pages=$results;realDeviceTested=$false;businessWrites=0;deployed=$false;uploaded=$false} -Depth 15))
 Write-Output 'Both pages: 44px targets and month navigation passed; screenshots saved for visual review'
}finally{
 if($original -in @('pages/ledger/index','pages/statistics/index','pages/items/index','pages/me/index')){Ide automation_navigate @('--action','switchTab','--url',('/'+$original),'--wait','1')|Out-Null}
}
