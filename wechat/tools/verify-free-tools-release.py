"""Validate local release contents and test evidence; never access a live API."""
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'wechat/backend'))
from palm.membership import ANNOUNCEMENT_ID, ANNOUNCEMENT_TITLE, FEEDBACK_MESSAGE

notice = json.loads(subprocess.check_output([
    'node', '-e', 'console.log(JSON.stringify(require(process.argv[1])))',
    str(root / 'wechat/miniprogram/utils/release-notice-content.js')], text=True, encoding='utf-8'))
assert (notice['id'], notice['title'], '\n\n'.join(notice['paragraphs'])) == (ANNOUNCEMENT_ID, ANNOUNCEMENT_TITLE, FEEDBACK_MESSAGE)
out = root / 'wechat/deploy/cloudbase/free-tools-20261025'
manifest = json.loads((out / 'release-manifest.json').read_text(encoding='utf-8'))
for bundle in manifest['bundles']:
    assert hashlib.sha256((out / bundle['file']).read_bytes()).hexdigest() == bundle['sha256']
    with zipfile.ZipFile(out / bundle['file']) as z:
        assert z.testzip() is None
with zipfile.ZipFile(out / 'palm-api-free-tools-python310.zip') as z:
    for p in (root / 'wechat/backend/palm').glob('*.py'):
        assert z.read('palm/' + p.name) == p.read_bytes().replace(b'\r\n', b'\n'), p
    assert 'third_party/PIL/_imaging.cpython-310-x86_64-linux-gnu.so' in z.namelist()
    assert not any(n.endswith(('.env', '.sqlite3', '.pyd')) for n in z.namelist())
with zipfile.ZipFile(out / 'catpaw-editable-source-and-icons.zip') as z:
    for n in ['utils/member.js', 'utils/release-notice-content.js', 'pages/member-tools/index.js', 'pages/membership/index.js']:
        assert z.read('miniprogram/' + n) == (root / 'wechat/miniprogram' / n).read_bytes()
    assert z.read('tests/cash-ledger.test.cjs') == (root / 'wechat/tests/cash-ledger.test.cjs').read_bytes()
    assert z.read('docs/free-tools-20261025.md') == (root / 'wechat/docs/free-tools-20261025.md').read_bytes()
images = root / 'wechat/docs/images/free-tools-20261025'
layout = json.loads((images / 'layout-results.json').read_text(encoding='utf-8'))
compile = json.loads((images / 'compile-results.json').read_text(encoding='utf-8-sig'))
assert layout['passed'] and len(layout['checks']) == 54
assert compile['passed'] and len(compile['checks']) == 6
js = (root / 'test-results/free-tools-js.log').read_text(encoding='utf-8')
py = (root / 'test-results/free-tools-python.log').read_text(encoding='utf-8')
pay = (root / 'test-results/free-tools-payment-final.log').read_text(encoding='utf-8')
assert 'pass 481' in js and 'fail 0' in js
assert 'Ran 424 tests' in py and py.rstrip().endswith('OK')
assert 'Ran 100 tests' in pay and pay.rstrip().endswith('OK')
build = json.loads((root / 'test-results/beauty-icons-build.json').read_text(encoding='utf-8'))
for bundle_key in ('sourcePackages', 'builtPackages'):
    assert build[bundle_key]['mainBytes'] <= build[bundle_key]['mainBudgetBytes'] == 1450000
result = {
    'passed': True, 'frontend_tests': 481, 'backend_full_tests': 424, 'payment_final_tests': 100,
    'layout_cases': 54, 'wechat_compile_cases': 6, 'announcement_parity': True,
    'runtime_packages_verified': True, 'main_package_bytes': build['builtPackages']['mainBytes'],
    'offline_previews': True, 'wechat_screenshots_available': False,
    'wechat_automation_error': 'timeout waiting for automator response',
    'real_device_tested': False, 'real_payment_tested': False,
    'deployed': False, 'uploaded': False, 'remote_business_writes': 0,
}
for p in (images / 'verification.json', out / 'verification.json'):
    p.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result))
