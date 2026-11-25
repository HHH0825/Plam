"""Run the authorized local IDE verifier. Never export page credentials."""
import os
import json
from pathlib import Path
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parents[1]
tool = sys.argv[1]
cmd = [os.environ.get('PALM_WECHAT_IDE', 'wechatide.cmd'), '-c', 'codex', tool,
       '--project', str(root / 'miniprogram')]
if tool == 'automation_evaluate':
    source = Path(sys.argv[2]).read_text(encoding='utf-8').replace('\n', ' ').replace('\r', ' ')
    if '"' in source:
        raise ValueError('Use single quoted JS literals for Windows CLI parsing')
    cmd += ['--fn-source', source]
    if len(sys.argv) > 3:
        cmd += ['--args-file', str(Path(sys.argv[3]).resolve())]
else:
    cmd += sys.argv[2:]
reply = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
try:
    data = json.loads(reply.stdout[reply.stdout.index('{'):])
except ValueError:
    data = {'ok': False, 'error': 'IDE_OUTPUT_NOT_JSON', 'exit_code': reply.returncode}
# Preview tools also return the full QR bitmap; it is already saved by --qr-output.
# Keep console output small and avoid dumping a binary array.
result = data.get('result')
if isinstance(result, dict) and isinstance(result.get('qrcode'), dict):
    qr = result['qrcode']
    if isinstance(qr.get('data'), list):
        result['qrcode'] = {'type': qr.get('type'), 'bytes': len(qr['data'])}
print(json.dumps(data, ensure_ascii=False))
if not data.get('ok'):
    sys.exit(1)
