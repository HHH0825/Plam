$ErrorActionPreference='Stop'
$project=Join-Path $PSScriptRoot '../miniprogram'
$project=[IO.Path]::GetFullPath($project)
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/subscription-20261011'))
$scratch=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.qa-purchases'))
$source=(Get-Content (Join-Path $PSScriptRoot 'purchases-native-check.js') -Raw) -replace '\r?\n',' '
$checks=[System.Collections.Generic.List[string]]::new()
function Invoke-Ide([string]$tool,[string[]]$flags) {
  $raw=(& wechatide -c Codex $tool --project $project @flags | Out-String)
  $result=$raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
  if (!$result.ok -or !$result.result.success) { throw $raw }
  return $result.result
}
function Set-Arguments($values) {
  $file=Join-Path $scratch 'native-subscription-args.json'
  [IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $values -Depth 20 -Compress))
  return $file
}
function Fixture([string]$action) {
  $file=Set-Arguments @($action)
  $result=Invoke-Ide automation_evaluate @('--fn-source',$source,'--args-file',$file)
  return $result.result.result
}
function Method([string]$name,$values=@()) {
  $file=Set-Arguments $values
  Invoke-Ide automation_page_action @('--action','callMethod','--method',$name,'--args-file',$file) | Out-Null
}
function Check([string]$key,$expected,[string]$description) {
  $result=Invoke-Ide automation_page_action @('--action','getData','--data-path',$key,'--wait','0.2')
  if ($result.data -ne $expected) { throw "$description : expected $expected, got $($result.data)" }
  $checks.Add($description)
}
function Screenshot([string]$name,[string]$selector) {
  Invoke-Ide automation_runtime_info @('--action','currentPage') | Out-Null
  Invoke-Ide automation_page_action @('--action','querySelector','--selector',$selector,'--wait','0.5') | Out-Null
  Invoke-Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait-for-selector',$selector) | Out-Null
  Write-Output "Screenshot: $name"
}
try {
  Fixture setup | Out-Null
  Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null
  Invoke-Ide automation_runtime_info @('--action','currentPage') | Out-Null
  Method load
  Check 'items.0.id' 990001 'Item screenshot uses in-memory sample only'
  Screenshot items '.wishlist-entry'
  Invoke-Ide automation_element_action @('--action','tap','--selector','.wishlist-entry') | Out-Null
  Screenshot wishlist '.wish-price'
  Invoke-Ide automation_navigate @('--action','navigateBack') | Out-Null
  Invoke-Ide automation_element_action @('--action','tap','--selector','.subscription-entry','--wait-for-selector','.subscription-entry') | Out-Null
  Screenshot expenses '.expense-amount'
  Check listReady $true 'Normal list is available'
  Method filter @(@{detail=@{value=1}})
  Check 'shown.length' 0 'Paused filter has no sample rows'
  Method filter @(@{detail=@{value=0}})
  Check 'shown.length' 2 'Active filter restores sample rows'
  Method open @(@{currentTarget=@{dataset=@{id=990051}}})
  Method beginPay
  Check paying $true 'Payment opens without writing'
  Screenshot payment '.purchase-form'
  Method cancelPay
  Method back
  Fixture 'mode:items-error' | Out-Null
  Method load
  Check itemsReady $false 'Device failure disables association picker'
  Check 'shown.length' 2 'Device failure retains subscription rows'
  Method open @(@{currentTarget=@{dataset=@{id=990051}}})
  Method edit
  Check 'form.item_id' 990001 'Editing retains original association'
  Screenshot association-error '.association-warning'
  Fixture 'mode:normal' | Out-Null
  Method retryItems
  Check itemsReady $true 'Device retry succeeds'
  Check itemsError '' 'Device retry clears warning'
  Check 'form.item_id' 990001 'Device retry does not change association'
  Method back
  Fixture 'mode:unavailable' | Out-Null
  Method load
  Check featureUnavailable $true 'Missing list API is unavailable'
  Method add
  Check editing $false 'Unavailable API blocks add'
  Screenshot unavailable '.subscription-recheck'
  Fixture 'mode:empty' | Out-Null
  Invoke-Ide automation_element_action @('--action','tap','--selector','.subscription-recheck') | Out-Null
  Check featureUnavailable $false 'Recheck clears unavailable flag'
  Check error '' 'Recheck clears prior error'
  Check 'shown.length' 0 'Successful empty response is an empty list'
  Screenshot empty '.empty'
  Fixture 'mode:normal' | Out-Null
  Method load
  Fixture 'mode:deleted' | Out-Null
  Method open @(@{currentTarget=@{dataset=@{id=990051}}})
  Check detailMissing $true 'Deleted detail uses distinct state'
  Screenshot deleted-detail '.subscription-error'
  Method back
  Check detailMissing $false 'Return clears deleted-detail state'
  Fixture 'mode:normal' | Out-Null
  Invoke-Ide automation_navigate @('--action','navigateBack') | Out-Null
  Method openFilters
  Check filterOpen $true 'Item filter still opens'
  Screenshot item-filter '.sheet-apply'
  Method resetDraftFilters
  Method applyFilters
  Check filterOpen $false 'Item filter reset and confirmation close sheet'
  $state=Fixture inspect
  if ($state.remoteWrites -ne 0) { throw 'Unexpected remote write' }
  [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{checks=$checks;remoteWrites=0;fixtureOnly=$true} -Depth 10))
  Write-Output "Passed $($checks.Count) native checks; remote writes: 0"
} finally {
  Fixture restore | Out-Null
  Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null
  Write-Output 'Original transport restored'
}
