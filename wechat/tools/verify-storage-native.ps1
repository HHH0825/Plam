$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/storage-locations'))
$scratch=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.qa-locations'))
$baseline=(Get-Content (Join-Path $PSScriptRoot 'purchases-native-check.js') -Raw) -replace '\r?\n',' '
$source=(Get-Content (Join-Path $PSScriptRoot 'locations-native-check.js') -Raw) -replace '\r?\n',' '
$checks=[System.Collections.Generic.List[string]]::new()
function Invoke-Ide([string]$tool,[string[]]$flags) {
  $raw=(& wechatide -c Codex $tool --project $project @flags | Out-String)
  $result=$raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
  if (!$result.ok -or !$result.result.success) { throw $raw }
  return $result.result
}
function Arguments($values) {
  $file=Join-Path $scratch 'native-args.json'
  [IO.File]::WriteAllText($file,(ConvertTo-Json -InputObject $values -Depth 20 -Compress))
  return $file
}
function Fixture([string]$action,[string]$code=$source) { $file=Arguments @($action);return (Invoke-Ide automation_evaluate @('--fn-source',$code,'--args-file',$file)).result.result }
function Method([string]$name,$values=@()) { $file=Arguments $values;Invoke-Ide automation_page_action @('--action','callMethod','--method',$name,'--args-file',$file) | Out-Null }
function Tap([string]$selector) { Invoke-Ide automation_element_action @('--action','tap','--selector',$selector) | Out-Null }
function Check([string]$key,$expected,[string]$description) {
 $result=Invoke-Ide automation_page_action @('--action','getData','--data-path',$key,'--wait','0.2')
 if($result.data -ne $expected){throw "$description : expected $expected, got $($result.data)"};$checks.Add($description)
}
function Screenshot([string]$name,[string]$selector) {
 Invoke-Ide simulator_screenshot @('--path',(Join-Path $output ($name+'-native.png')),'--optimize','false','--wait-for-selector',$selector) | Out-Null
 Write-Output "Screenshot: $name"
}
try {
 Fixture setup $baseline | Out-Null;Fixture setup | Out-Null
 Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null
 Method load;Check 'items.0.id' 990001 'Only memory examples appear';Screenshot entries '.storage-entry'
 Tap '.storage-entry';Check 'locations.length' 2 'Storage entry opens flat location list'
 $geometry=Fixture measure
 if(@($geometry.rowWidths | Where-Object {$_ -lt ($geometry.pageWidth-38)}).Count){throw 'Native button defaults shrink location rows'}
 if($geometry.createWidth -gt 160){throw 'Native default width enlarges create button'}
 $checks.Add('Native location rows fill the content width and create stays compact')
 Screenshot locations '.location-row'
 Tap '.location-row[data-id="990101"]';Check 'shownItems.length' 2 'Location detail filters assigned items';Screenshot location-items '.stored-item'
 Tap '.storage-create';Check selecting $true 'Add items opens selection'
 Tap '.stored-item[data-id="990002"]';Check chosenCount 1 'Unassigned item can be selected'
 Method searchItems @(@{detail=@{value='相机'}});Check chosenCount 1 'Search retains selected IDs'
 Method searchItems @(@{detail=@{value=''}});Screenshot batch-add '.storage-batch'
 Method addSelected;Check 'shownItems.length' 3 'Confirm moves the selected example atomically'
 Method beginSelect;Tap '.stored-item[data-id="990002"]';Method chooseTarget;Screenshot batch-move '.storage-target'
 Tap '.target-row[data-id="990102"]';Check 'shownItems.length' 2 'Moving to another location removes it from this list'
 Method beginSelect;Tap '.stored-item[data-id="990001"]';Tap '.stored-item[data-id="990003"]'
 Fixture 'mode:conflict' | Out-Null;Method clearSelected;Check conflict $true 'Version conflict is shown';Check chosenCount 2 'Version conflict preserves selections';Screenshot conflict '.storage-error'
 Fixture 'mode:normal' | Out-Null;Method review;Check conflict $false 'Review accepts current versions';Check chosenCount 2 'Review retains valid selections';Method clearSelected;Check 'shownItems.length' 0 'Clear only unlinks selected items'
 Method groups;Check unassigned 2 'Unassigned count follows cleared links'
 Fixture 'mode:unavailable' | Out-Null;Method load;Check ready $false 'Missing API disables writes';Method newLocation;Check naming $false 'Unavailable API cannot add locations';Screenshot unavailable '.storage-error'
 Fixture 'mode:normal' | Out-Null;Method load;Check ready $true 'Manual recheck succeeds';Check error '' 'Successful retry clears the error'
 Invoke-Ide automation_navigate @('--action','navigateBack') | Out-Null
 Method openFilters;Check filterOpen $true 'Filter opens above navigation';Screenshot filter '.sheet-apply';Method resetDraftFilters;Method applyFilters;Check filterOpen $false 'Filter reset and apply remain usable'
 Method open @(@{currentTarget=@{dataset=@{id=990002}}});Screenshot detail '.detail-storage-row'
 Method changeStorageLocation;Check assignItemId 990002 'Detail opens single-item location chooser';Tap '.location-row[data-id="990101"]'
 Check 'item.storage_location_name' '书桌抽屉' 'Single change reloads the detail location'
 Method edit;Check locationsReady $true 'Editor loads optional locations';Check 'form.storage_location_id' 990101 'Editor preserves the current location';Screenshot editor '.location-picker-value'
 $state=Fixture inspect
 [IO.File]::WriteAllText((Join-Path $output 'native-results.json'),(ConvertTo-Json -InputObject @{checks=$checks;remoteWrites=0;fixtureOnly=$true;memoryWrites=$state.memoryWrites} -Depth 10))
 Write-Output "Passed $($checks.Count) native checks; remote writes: 0"
} finally {
 Fixture restore | Out-Null;Fixture restore $baseline | Out-Null
 Invoke-Ide automation_navigate @('--action','switchTab','--url','/pages/items/index') | Out-Null
 Write-Output 'Original transport restored'
}

