$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/subscriptions-native-project'))
$out=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../test-results/subscriptions-20261021/native'))
[IO.Directory]::CreateDirectory($out)|Out-Null
if([IO.File]::ReadAllText((Join-Path $project 'config.js')) -notmatch '127\.0\.0\.1:9'){throw 'Offline only'}
function Ide([string]$tool,[string[]]$flags){
 $raw=(& 'wechat-devtools/wechatide.cmd' -c Codex $tool --project $project @flags|Out-String)
 $r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$r.ok -or ($r.result.success -eq $false)){throw $raw};return $r.result
}
function Arguments($values){$f=Join-Path $out 'args.json';[IO.File]::WriteAllText($f,(ConvertTo-Json -InputObject $values -Depth 20 -Compress));return $f}
function Method([string]$name,$values=@()){$file=Arguments @($name,$values);return Ide automation_evaluate @('--fn-source','function(name,args){const p=getCurrentPages().slice(-1)[0];return p[name].apply(p,args)}','--args-file',$file)}
function Snapshot(){return (Ide automation_evaluate @('--fn-source','function(){const p=getCurrentPages().slice(-1)[0];return {route:p.route,data:p.data,requests:getApp().globalData.qaRequests}}')).result.result}
function Photo($name){Ide simulator_screenshot @('--path',(Join-Path $out ($name+'.png')),'--optimize','false','--wait','0.5')|Out-Null}
$compiled=@()
foreach($route in @('pages/fixed-expenses/index','pages/ledger-detail/index')){foreach($type in @('wxml','wxss')){Ide ('compile_'+$type) @('--file-path',($route+'.'+$type))|Out-Null;$compiled+=($route+'.'+$type)}}
Ide automation_navigate @('--action','navigateTo','--url','/pages/fixed-expenses/index')|Out-Null
Method add|Out-Null
Method field @(@{currentTarget=@{dataset=@{field='name'}};detail=@{value='音乐会员'}})|Out-Null
Method field @(@{currentTarget=@{dataset=@{field='amount'}};detail=@{value='30.00'}})|Out-Null
Photo 'subscription-top'
$sub=Snapshot
if(!$sub.data.editing -or $sub.data.recordInitial){throw 'Opt-in must start off'}
Method kindChange @(@{currentTarget=@{dataset=@{index=1}};detail=@{value=1}})|Out-Null
Method field @(@{currentTarget=@{dataset=@{field='name'}};detail=@{value='手机分期'}})|Out-Null
Method field @(@{currentTarget=@{dataset=@{field='principal_total'}};detail=@{value='6000.01'}})|Out-Null
Photo 'installment-top'
Method toggleFees @(@{detail=@{value=$true}})|Out-Null
Method field @(@{currentTarget=@{dataset=@{field='amount'}};detail=@{value='5.00'}})|Out-Null
Method toggleInitial @(@{detail=@{value=$true}})|Out-Null
$scrollFile=Arguments @('.expense-initial');Ide automation_evaluate @('--fn-source','function(selector){wx.pageScrollTo({selector,duration:0});return true}','--args-file',$scrollFile)|Out-Null
Photo 'first-payment'
$before=Snapshot
if(!$before.data.recordInitial -or $before.data.formSummary.actual -ne '505.00'){throw 'Actual split incorrect'}
$scrollFile=Arguments @('.expense-summary');Ide automation_evaluate @('--fn-source','function(selector){wx.pageScrollTo({selector,duration:0});return true}','--args-file',$scrollFile)|Out-Null
Photo 'payment-summary'
Method save|Out-Null
$after=Snapshot
if($after.data.editing -or !$after.data.selected.initial_payment_created -or $after.data.selected.next_cycle_index -ne 1){throw 'Expected confirmed payment'}
Photo 'saved-plan'
$selectorFile=Arguments @('.payment-actions .button','.expense-delete')
$buttonLayout=(Ide automation_evaluate @('--fn-source','function(actions,remove){return new Promise(resolve=>wx.createSelectorQuery().selectAll(actions).boundingClientRect().select(remove).boundingClientRect().exec(resolve))}','--args-file',$selectorFile)).result.result
if($buttonLayout[0].Count -ne 2 -or $buttonLayout[0][0].height -lt 44 -or $buttonLayout[0][1].height -lt 44 -or $buttonLayout[1].height -lt 44){throw 'Visible payment and delete buttons must have 44px touch targets'}
$selectorFile=Arguments @('.payment-actions')
Ide automation_evaluate @('--fn-source','function(selector){wx.pageScrollTo({selector,duration:0});return true}','--args-file',$selectorFile)|Out-Null
Photo 'payment-action-buttons'

Ide automation_navigate @('--action','navigateTo','--url','/pages/ledger-detail/index?id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')|Out-Null
$ledger=Snapshot
if(!$ledger.data.row.deletable -or $ledger.data.row.editable){throw 'Auto row must be delete-only'}
Ide automation_evaluate @('--fn-source','function(){wx.pageScrollTo({scrollTop:9999,duration:0});return true}')|Out-Null
Photo 'ledger-delete'
# Only the isolated fixture accepts automatic confirmation; the app source is untouched.
Ide automation_evaluate @('--fn-source','function(){getApp().qaOriginalModal=wx.showModal;wx.showModal=function(o){getApp().qaDeleteConfirm={title:o.title,content:o.content};o.success({confirm:true})};return true}')|Out-Null
Method void|Out-Null
$deleted=Snapshot
if($deleted.data.row.state -ne 'void' -or $deleted.data.row.deletable){throw 'Expected void audit entry'}
Photo 'ledger-deleted'
Ide automation_evaluate @('--fn-source','function(){wx.showModal=getApp().qaOriginalModal;return true}')|Out-Null
Ide automation_navigate @('--action','navigateBack')|Out-Null
$recomputed=Snapshot
if($recomputed.data.selected.paid_principal -ne '0.00' -or $recomputed.data.selected.next_cycle_index -ne 0){throw 'Expected updated plan progress'}
$console=Ide get_simulator_console @('--command','grep -n .');$console|ConvertTo-Json -Depth 8|Set-Content (Join-Path $out 'console.json') -Encoding UTF8
if($console -match 'unexpected token|WXSS 文件编译错误|navigateTo:fail timeout'){throw 'Native console contains compile or navigation errors'}
@{passed=$true;isolated=$true;productionCalls=0;buttonLayout=$buttonLayout;nativeCompiled=$compiled;subscription=$sub;before=$before;after=$after;ledger=$ledger;deleted=$deleted;recomputed=$recomputed;dialog='confirmation stub only in isolated native fixture; production handler covered by frontend/backend tests'}|ConvertTo-Json -Depth 20|Set-Content (Join-Path $out 'checks.json') -Encoding UTF8
Write-Output 'Native forms, opt-in save, ledger delete and return progress verified in isolated fixture.'

