$wechatIde = if ($env:PALM_WECHAT_IDE) { $env:PALM_WECHAT_IDE } else { 'wechatide.cmd' }
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram'))
$output=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../docs/images/rewards-20261017'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$checks=[System.Collections.Generic.List[object]]::new()
$files=@(Get-ChildItem -LiteralPath (Join-Path $project 'pages') -Recurse -Filter index.wxml | ForEach-Object { $_.FullName.Substring($project.Length+1).Replace('\','/') })
$files+=@('components/cat-loading/index.wxml','components/cat-feedback/index.wxml','pages/rewards/index.wxss','components/cat-loading/index.wxss','components/cat-feedback/index.wxss')
foreach($file in $files){
 Start-Sleep -Milliseconds 1800
 $kind=[IO.Path]::GetExtension($file).Substring(1)
 $raw=(& $wechatIde -c Codex ('compile_'+$kind) --project $project --file-path $file | Out-String)
 if($raw.IndexOf('{') -lt 0){throw $raw}
 $r=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$r.ok -or !$r.result.success){throw $raw}
 $checks.Add(@{file=$file;passed=$true})
 Write-Output "Compiled $($checks.Count)/$($files.Count) $file"
}
[IO.File]::WriteAllText((Join-Path $output 'compile-results.json'),(ConvertTo-Json -InputObject @{passed=$true;checks=$checks;deployed=$false} -Depth 8))
