"""Upload the approved frontend revision through the official IDE; record safe metadata."""
import os
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parents[1]
project = root / 'miniprogram'
record = root / 'docs/images/collection-refresh/upload-2026.10.08.json'
if record.exists():
    previous = json.loads(record.read_text(encoding='utf-8'))
    if previous.get('ok') or previous.get('pending'):
        print(json.dumps({'already_requested': True, **previous}, ensure_ascii=False))
        raise SystemExit(0)
version = '2026.10.08'
description = '首页纸纹背景、物品卡片与筛选更新'
reply = subprocess.run([os.environ.get('PALM_WECHAT_IDE', 'wechatide.cmd'), '-c', 'codex', 'upload',
    '--project', str(project), '--upload-version', version, '--desc', description],
    capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=90)
try:
    data = json.loads(reply.stdout[reply.stdout.index('{'):])
except (ValueError, TypeError):
    data = {'ok': False, 'errorType': 'IDE_OUTPUT_NOT_JSON'}
safe = {key: data.get(key) for key in ('ok', 'pending', 'taskId', 'errorType') if key in data}
safe.update(version=version, description=description,
    appid=json.loads((project / 'project.config.json').read_text(encoding='utf-8'))['appid'],
    platform_verified=False, experience_version_verified=False)
result = data.get('result')
if isinstance(result, dict):
    safe['result'] = {key: result.get(key) for key in ('success', 'uploadVersion', 'version', 'appid') if key in result}
safe['source_sha256'] = {name: hashlib.sha256((project / name).read_bytes()).hexdigest()
    for name in ('pages/items/index.wxml', 'pages/items/collection.wxss', 'pages/items/index.js', 'config.js', 'app.json')}
record.write_text(json.dumps(safe, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(safe, ensure_ascii=False))
