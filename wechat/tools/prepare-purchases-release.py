"""Prepare local release materials. Reuse pinned Linux/Node dependencies offline."""
import hashlib
import json
from pathlib import Path
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / 'deploy/cloudbase'
OUTPUT = DEPLOY / 'purchases-20261010'
RELEASE = 'purchases-20261010'


def build(name, baseline, prefix, sources):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / name
    entries = {}
    with zipfile.ZipFile(baseline) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('Invalid dependency baseline')
        for member in archive.namelist():
            if member.startswith(prefix) and not member.endswith('/'):
                if any(p in ('__pycache__', 'tests', 'test', '.git') for p in member.split('/')):
                    continue
                if member.endswith(('.pyc', '.pyd')):
                    continue
                entries[member] = archive.read(member)
    if not entries:
        raise RuntimeError('No dependency files in baseline')
    for path, member in sources:
        data = path.read_bytes().replace(b'\r\n', b'\n')
        if member.endswith('.py'):
            compile(data, member, 'exec')
        entries[member] = data
    manifest = {'release': RELEASE, 'applied': False,
                'business_data_included': False, 'dependency_baseline': baseline.name,
                'dependency_baseline_sha256': hashlib.sha256(baseline.read_bytes()).hexdigest(),
                'runtime_sources': {member: hashlib.sha256(entries[member]).hexdigest() for _, member in sources}}
    entries['bundle-info.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for member, data in sorted(entries.items()):
            info = zipfile.ZipInfo(member)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | (0o755 if member == 'scf_bootstrap' else 0o644)) << 16
            archive.writestr(info, data)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        if prefix == 'third_party/':
            assert 'third_party/PIL/_imaging.cpython-310-x86_64-linux-gnu.so' in archive.namelist()
            assert b'\r' not in archive.read('scf_bootstrap')
            assert (archive.getinfo('scf_bootstrap').external_attr >> 16) & 0o777 == 0o755
        else:
            assert 'node_modules/@cloudbase/node-sdk/package.json' in archive.namelist()
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix('.zip.sha256').write_text(f'{digest}  {target.name}\n', encoding='utf-8')
    return {'file': name, 'bytes': target.stat().st_size, 'sha256': digest, **manifest}


def main():
    sources = [(p, 'palm/' + p.name) for p in (ROOT / 'backend/palm').glob('*.py')]
    sources += [(ROOT / 'backend/cloudbase_probe' / n, 'cloudbase_probe/' + n) for n in ('__init__.py', 'client.py')]
    sources += [(DEPLOY / 'api' / n, n) for n in ('app.py', 'scf_bootstrap', 'requirements.txt')]
    reports = [build('palm-api-python310.zip', DEPLOY / 'photo-compression-20261009/palm-api-photo-compression-python310.zip', 'third_party/', sources)]
    sources = [(DEPLOY / 'bridge' / n, n) for n in ('index.js', 'package.json', 'package-lock.json')]
    reports.append(build('palm-api-bridge-node20.zip', DEPLOY / 'palm-api-bridge-node20.zip', 'node_modules/', sources))
    (OUTPUT / 'manifest.json').write_text(json.dumps({'applied': False, 'bundles': reports}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps([{'file': r['file'], 'bytes': r['bytes'], 'sha256': r['sha256']} for r in reports]))


if __name__ == '__main__':
    main()
