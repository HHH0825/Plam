param([string]$OutputDirectory='./wechat/docs/images/virtual-payment-20261015')
$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($output)|Out-Null
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'member-native-check.js')).Replace("`r",'').Replace("`n",' ')
$checks=[System.Collections.Generic.List[string]]::new()
function Ide([string]$tool,[string[]]$flags){$raw=(& $wechatIde -c Codex $tool --project $project @flags|Out-String);$r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json;if(!$r.ok -or !$r.result.success){throw $raw};return $r.result}
function Eval([string]$fn,$argsValue=@()){$argsFile=Join-Path $output 'native-args.json';[IO.File]::WriteAllText($argsFile,(ConvertTo-Json -InputObject $argsValue -Compress -Depth 40));return (Ide automation_evaluate @('--fn-source',$fn,'--args-file',$argsFile)).result.result}
function Run([string]$action,$value=$null){return Eval $source @($action,$value)}
function Check($condition,[string]$label){if(!$condition){throw $label};$checks.Add($label)}
function Shot([string]$name){Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait','1')|Out-Null}
$fixture=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../../test-results/member-fixture.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
$original=(Ide automation_evaluate @('--fn-source','function(){return getCurrentPages().slice(-1)[0].route}')).result.result
$passed=$false
try{
 Run setup $fixture|Out-Null
 Run navigate '/pages/membership/index'|Out-Null;Run settle|Out-Null
 $s=Run state;Check (!$s.membership.payment_open -and $s.selected -eq 'year' -and $s.plans.Count -eq 3) 'Checkout closed by default; all three original plans remain'
 Run bottom|Out-Null;Shot checkout-closed
 Eval 'async function(){const q=getApp()._memberQA;Object.assign(q.responses[''/membership''],{payment_open:true,ios_payment_open:true});await getCurrentPages().slice(-1)[0].load();return true}'|Out-Null
 Run settle|Out-Null;Run bottom|Out-Null;Shot checkout-open-fixture
 $r=Eval 'async function(){const p=getCurrentPages().slice(-1)[0];p.setData({buying:true});p.select({currentTarget:{dataset:{id:''month''}}});const selected=p.data.selected;p.setData({buying:false});await p.buy();return {selected,note:p.data.paymentNote,buying:p.data.buying,payWrites:getApp()._memberQA.calls.filter(r=>r.method!==''GET''&&r.route.startsWith(''/pay/'')).length}}'
 Check ($r.selected -eq 'year') 'Plan cannot change while checkout is running'
 Check (!$r.buying -and $r.note -match '手机微信' -and $r.payWrites -eq 0) 'Developer-tool payment attempt stops before creating an order'
 Shot developer-tools-payment-gate
 $passed=$true
}finally{
 $restored=$false
 try{$restored=Run restore}catch{}
 try{$method=if($original -in @('pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index')){'switchTab'}else{'redirectTo'};Eval 'function(url,method){return new Promise((resolve,reject)=>wx[method]({url,success:()=>resolve(true),fail:reject}))}' @('/'+$original,$method)|Out-Null}catch{}
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json @{passed=$passed;checks=$checks;fixtureOnly=$true;realPaymentTested=$false;deployed=$false;remoteWrites=0;originalAccountRestored=$restored;originalRoute=$original} -Depth 10))
}
Write-Output "Native payment checks passed: $($checks.Count); no real payment or remote writes"
