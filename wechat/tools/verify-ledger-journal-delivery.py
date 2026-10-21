"""Verify local screenshots, tests, document links and bundle source hashes."""
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/images/ledger-journal-20261013'
RELEASE = ROOT / 'deploy/cloudbase/ledger-journal-20261013'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


logs = {name: ROOT / '.qa-ledger-tmp' / ('journal-' + name + '-tests.log')
        for name in ('backend', 'client', 'contract')}
backend, client, contract = (logs[name].read_text(encoding='utf-8')
                             for name in ('backend', 'client', 'contract'))
assert 'Ran 220 tests' in backend and backend.rstrip().endswith('OK')
assert 'Ran 30 tests' in contract and contract.rstrip().endswith('OK')
assert 'tests 235' in client and 'fail 0' in client
browser = read_json(OUT / 'browser-results.json')
native = read_json(OUT / 'native-results.json')
audit = read_json(OUT / 'package-audit.json')
assert browser['passed'] and browser['cases'] == 23 and native['passed']
assert native['compiledFiles'] == 4 and len(native['checks']) == 12
assert browser['remoteWrites'] == native['remoteWrites'] == 0
for case in browser['checks']:
    assert not case['overflow'] and not case['failed']
    assert all(m['oneLine'] for m in case['money'])
    assert all(d['width'] >= 43.9 and d['height'] >= 44 for d in case['calendar'])
    assert all(a['actual'] <= a['available'] + 1 for a in case['calendarAmounts'])

manifest = read_json(RELEASE / 'manifest.json')
assert manifest['applied'] is False
for bundle in manifest['bundles']:
    archive = RELEASE / bundle['file']
    assert digest(archive) == bundle['sha256'] and not bundle['business_data_included']
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for name, expected in bundle['runtime_sources'].items():
            assert hashlib.sha256(z.read(name)).hexdigest() == expected
        if 'python310' in archive.name:
            for source in (ROOT / 'backend/palm').glob('*.py'):
                assert z.read('palm/' + source.name) == source.read_bytes().replace(b'\r\n', b'\n')
delta = read_json(RELEASE / 'resources-delta.json')
assert delta['collections'] == delta['indexes'] == delta['fields'] == []
assert delta['migrationRequired'] is False and delta['applied'] is False

for doc in (ROOT / 'docs/ledger-journal-20261013.md', ROOT / 'docs/cash-ledger-api-20261013.md'):
    for link in re.findall(r'\]\(([^)]+)\)', doc.read_text(encoding='utf-8')):
        if link.startswith('http') or link.endswith('/verification.json'):
            continue
        assert (doc.parent / link).exists(), link

runtime = ['utils/ledger.js', 'utils/ledger-tabs.js', 'utils/ledger-calendar.js',
           'utils/compact-money.js', 'templates/ledger.wxml', 'styles/ledger-journal.wxss',
           'pages/ledger/index.wxml', 'pages/ledger/index.wxss',
           'pages/statistics/index.wxml', 'pages/statistics/index.wxss']
report = {
    'date': '2026-10-13', 'localOnly': True,
    'backendTestsPassed': 220, 'ledgerContractTests': 30,
    'clientTestsPassed': 235, 'journalClientTests': 11,
    'browserCases': browser['cases'], 'nativeChecksPassed': len(native['checks']),
    'wechatCompiledFiles': native['compiledFiles'],
    'nativeViewportWidth': native['geometry']['window']['windowWidth'],
    'browserViewportWidths': sorted(set(x['width'] for x in browser['checks'])),
    'largeFontScale': 1.3, 'shortViewportHeight': 568,
    'realDeviceTested': False, 'productionCloudTested': False,
    'remoteBusinessWrites': 0, 'deploymentApplied': False, 'experienceUploaded': False,
    'packageIncludedRawBytes': audit['includedRawBytes'],
    'staticReferencesChecked': audit['checkedStaticReferences'],
    'bundleSourcesAndHashesVerified': True, 'docsLinksVerified': True,
    'newCollections': 0, 'newIndexes': 0, 'newFields': 0, 'migrationRequired': False,
    'testLogHashes': {name: digest(path) for name, path in logs.items()},
    'clientSourceHashes': {name: digest(ROOT / 'miniprogram' / name) for name in runtime}
}
(OUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if not k.endswith('Hashes')}, ensure_ascii=False))
