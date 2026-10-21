$ErrorActionPreference='Stop'
$pythonPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.venv/Scripts/python.exe'))
if(!(Test-Path -LiteralPath $pythonPath)){throw '未找到项目Python环境，请先按操作说明安装维护工具依赖。'}
$serverPath=Join-Path $PSScriptRoot 'server.py'
Start-Process -FilePath $pythonPath -ArgumentList @(('"'+$serverPath+'"')) -WindowStyle Hidden
