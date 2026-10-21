$ErrorActionPreference='Stop'
$toolRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$pythonPath=Join-Path $toolRoot '.venv/Scripts/python.exe'
if(!(Test-Path -LiteralPath $pythonPath)){
  $launcher=Get-Command py.exe -ErrorAction SilentlyContinue
  if(!$launcher){$launcher=Get-Command python.exe -ErrorAction Stop}
  & $launcher.Source -m venv (Join-Path $toolRoot '.venv')
  if($LASTEXITCODE -ne 0){throw 'Python环境创建失败，请安装Python 3.10或以上版本。'}
}
$requirements=Join-Path $toolRoot 'requirements-lock.txt'
& $pythonPath -m pip install -r $requirements
if($LASTEXITCODE -ne 0){throw '依赖安装未完成，请检查网络后重试。'}
& (Join-Path $PSScriptRoot 'start.ps1')
