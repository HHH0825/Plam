"""Reuse the installed developer-tool compiler offline. No downloaded dependencies."""
import os
from pathlib import Path
import json
import struct
import sys

archive = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ.get('PALM_WECHAT_DEVTOOLS', 'wechat-devtools')) / 'resources' / 'app.asar'
output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[2] / 'test-results/wechat-terser.cjs'
with archive.open('rb') as f:
    raw = f.read(16)
    header_size = struct.unpack('<I', raw[4:8])[0]
    length = struct.unpack('<I', raw[12:16])[0]
    header = json.loads(f.read(length))
    row = header['files']['node_modules']['files']['terser']['files']['dist']['files']['bundle.min.js']
    assert not row.get('unpacked')
    f.seek(8 + header_size + int(row['offset']))
    data = f.read(row['size'])
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(data)
print(str(output))
