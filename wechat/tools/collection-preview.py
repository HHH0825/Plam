"""Create a local preview QR with the authorized IDE; suppress binary output."""
import os
import json
from pathlib import Path
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parents[1]
output = root / 'docs/images/collection-refresh/phone-preview.png'
reply = subprocess.run([os.environ.get('PALM_WECHAT_IDE', 'wechatide.cmd'), '-c', 'codex', 'create_preview_qrcode',
    '--project', str(root / 'miniprogram'), '--qr-format', 'image', '--qr-output', str(output),
    '--page-path', 'pages/items/index'], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=90)
try:
    data = json.loads(reply.stdout[reply.stdout.index('{'):])
except (ValueError, TypeError):
    data = {'ok': False, 'errorType': 'IDE_OUTPUT_NOT_JSON'}
safe = {key: data.get(key) for key in ('ok', 'pending', 'taskId', 'errorType') if key in data}
if data.get('ok'):
    payload = data.get('result', {})
    qr = payload.get('qrcode')
    if isinstance(qr, dict) and qr.get('type') == 'Buffer':
        output.write_bytes(bytes(qr['data']))
    safe['qr_exists'] = output.exists()
    safe['path'] = str(output) if output.exists() else None
print(json.dumps(safe, ensure_ascii=False))
