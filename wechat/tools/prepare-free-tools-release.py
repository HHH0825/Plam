"""Offline release; copy pinned dependencies, use current sources, never deploy."""
import importlib.util
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[2]
wechat = root / 'wechat'
out = wechat / 'deploy/cloudbase/free-tools-20261025'
spec = importlib.util.spec_from_file_location('current_bundle', wechat / 'tools/prepare-current-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.OUT = out
builder.BASELINE = wechat / 'deploy/cloudbase/beauty-icons-20261018'
builder.FRONTEND_API_ONLY = True
# The shared builder also accepts its own previous generic manifest on reruns.
previous = out / 'upload-manifest.json'
if previous.exists():
    data = json.loads(previous.read_text(encoding='utf-8'))
    data.setdefault('runtime_build', {})
    previous.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
builder.main()

old = out / 'palm-api-beauty-icons-python310.zip'
api = out / 'palm-api-free-tools-python310.zip'
old.replace(api)
old.with_suffix('.zip.sha256').unlink()
source = out / 'catpaw-editable-source-and-icons.zip'
with zipfile.ZipFile(source, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(wechat / 'docs/free-tools-20261025.md', 'docs/free-tools-20261025.md')
    for name in ('prepare-free-tools-release.py', 'free-tools-fixture.py', 'verify-free-tools.cjs', 'verify-free-tools-release.py'):
        z.write(wechat / 'tools' / name, 'tools/' + name)

bundles = [builder.info(out / 'catpaw-miniprogram.zip'), builder.info(api), builder.info(source)]
manifest = {
    'release': 'free-tools-20261025', 'bundles': bundles,
    'runtime_build': json.loads((out / 'upload-manifest.json').read_text(encoding='utf-8'))['runtime_build'],
    'local_only': True, 'deployed': False, 'uploaded': False,
    'business_changes': True, 'database_migration': False,
    'monthly_price_cents': 290, 'platforms': ['android', 'ios'],
    'free_entitlements': ['books', 'budgets'],
    'paid_entitlements': ['ad_free', 'unlimited_items'],
    'historical_orders': 'immutable original product, price and duration',
    'requires_manual_configuration': ['new Android and iOS monthly products', 'palm-api product mapping'],
    'notice_id': 'free-tools-month-290-v1',
    'backend': 'all current backend sources with pinned Linux Python3.10 dependencies',
    'manual': 'wechat/docs/free-tools-20261025.md',
    'evidence': 'wechat/docs/images/free-tools-20261025',
    'real_device_payment_tested': False,
}
for name in ('release-manifest.json', 'upload-manifest.json'):
    (out / name).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
