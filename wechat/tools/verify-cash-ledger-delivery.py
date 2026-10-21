"""Check local evidence, release sources and document links; no network access."""
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/images/cash-ledger-20261013'
RELEASE = ROOT / 'deploy/cloudbase/cash-ledger-20261013'
backend = (ROOT / '.qa-ledger-tmp/backend-tests.log').read_text(encoding='utf-8')
client = (ROOT / '.qa-ledger-tmp/client-tests.log').read_text(encoding='utf-8')
contract = (ROOT / '.qa-ledger-tmp/ledger-contract-tests.log').read_text(encoding='utf-8')
assert 'Ran 216 tests' in backend and backend.rstrip().endswith('OK')
assert 'Ran 26 tests' in contract and contract.rstrip().endswith('OK')
assert 'tests 224' in client and 'fail 0' in client
browser = json.loads((OUT / 'browser-results.json').read_text(encoding='utf-8'))
native = json.loads((OUT / 'native-results.json').read_text(encoding='utf-8'))
audit = json.loads((OUT / 'package-audit.json').read_text(encoding='utf-8'))
assert browser['passed'] and native['passed']
manifest = json.loads((RELEASE / 'manifest.json').read_text(encoding='utf-8'))
for bundle in manifest['bundles']:
    archive = RELEASE / bundle['file']
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == bundle['sha256']
    with zipfile.ZipFile(archive) as z:
        for name, digest in bundle['runtime_sources'].items():
            assert hashlib.sha256(z.read(name)).hexdigest() == digest
        if 'python310' in archive.name:
            for source in (ROOT / 'backend/palm').glob('*.py'):
                assert z.read('palm/' + source.name) == source.read_bytes().replace(b'\r\n', b'\n')
report = {
    'date': '2026-10-13', 'localOnly': True,
    'backendTestsPassed': 216, 'ledgerContractTests': 26,
    'clientTestsPassed': 224, 'ledgerClientTests': 11,
    'browserCases': browser['cases'], 'nativeChecksPassed': len(native['checks']),
    'wechatCompiledFiles': native['compiledFiles'],
    'nativeViewportWidth': native['geometry']['window']['windowWidth'],
    'realDeviceTested': False, 'productionCloudTested': False,
    'remoteBusinessWrites': 0, 'deploymentApplied': False, 'experienceUploaded': False,
    'packageIncludedRawBytes': audit['includedRawBytes'],
    'staticReferencesChecked': audit['checkedStaticReferences'],
    'bundleSourcesAndHashesVerified': True, 'docsLinksVerified': True
}
for doc in (ROOT / 'docs/cash-ledger-20261013.md', ROOT / 'docs/cash-ledger-api-20261013.md'):
    for link in re.findall(r'\]\(([^)]+)\)', doc.read_text(encoding='utf-8')):
        if link.startswith('http') or link.endswith('/verification.json'):
            continue
        assert (doc.parent / link).exists(), link
(OUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
