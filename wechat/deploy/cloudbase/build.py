"""Build only runtime sources and pinned Linux dependencies; never copy credentials/data."""
import hashlib
from importlib import metadata as distribution_metadata
import json
from pathlib import Path
import stat
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT.parents[1] / 'backend'


def bundle(output, entries, manifest):
    pending = output.with_suffix('.zip.building')
    with zipfile.ZipFile(pending, 'w', zipfile.ZIP_DEFLATED) as archive:
        for source, name in sorted(entries, key=lambda entry: entry[1]):
            data = source.read_bytes()
            if name.endswith(('.py', '.js', '.json', '.txt')) or name == 'scf_bootstrap':
                data = data.replace(b'\r\n', b'\n')
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | (0o755 if name == 'scf_bootstrap' else 0o644)) << 16
            archive.writestr(info, data)
        archive.writestr('bundle-info.json', json.dumps(manifest, indent=2) + '\n')
    with zipfile.ZipFile(pending) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert not any('__pycache__' in name or name.endswith(('.pyc', '.pyd', '.sqlite3', '.env')) for name in names)
        assert not any(part in ('tests', '.git', '.venv') for name in names for part in name.split('/'))
        assert not any(name.startswith('instance/') for name in names)
        if 'scf_bootstrap' in names:
            assert b'\r' not in archive.read('scf_bootstrap')
            assert (archive.getinfo('scf_bootstrap').external_attr >> 16) & 0o777 == 0o755
            assert 'third_party/PIL/_imaging.cpython-310-x86_64-linux-gnu.so' in names
        else:
            assert 'node_modules/@cloudbase/node-sdk/package.json' in names
    pending.replace(output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='utf-8')
    print(json.dumps({'file': output.name, 'bytes': output.stat().st_size, 'sha256': digest}))


def build(python_only=False):
    with tempfile.TemporaryDirectory(prefix='.pack-', dir=ROOT) as temporary:
        stage = Path(temporary).resolve()
        if not stage.is_relative_to(ROOT): raise RuntimeError('Invalid staging directory')
        vendor = stage / 'third_party'
        # crcmod 1.7 supplies its own portable Python fallback. Its optional C
        # extension has no official Linux cp310 wheel; never copy a Windows DLL.
        requirements = stage / 'wheel-requirements.txt'
        requirements.write_text('\n'.join(line for line in (ROOT / 'api/requirements.txt').read_text().splitlines()
                                           if not line.startswith('crcmod==')) + '\n')
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
            '--no-compile', '--no-cache-dir', '--no-deps', '--only-binary=:all:', '--platform', 'manylinux2014_x86_64',
            '--implementation', 'cp', '--python-version', '3.10', '--abi', 'cp310',
            '--target', str(vendor), '-r', str(requirements)], check=True)
        crc = distribution_metadata.distribution('crcmod')
        if crc.version != '1.7': raise RuntimeError('Install pinned crcmod==1.7 in build environment')
        for name in ('__init__.py', 'crcmod.py', '_crcfunpy.py', 'predefined.py'):
            target = vendor / 'crcmod' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(crc.locate_file('crcmod/' + name), target)
        crc_metadata = vendor / 'crcmod-1.7.dist-info'
        crc_metadata.mkdir()
        crc_metadata.joinpath('METADATA').write_text(crc.read_text('METADATA'))
        packages = {}
        for metadata in vendor.glob('*.dist-info/METADATA'):
            fields = metadata.read_text(encoding='utf-8').splitlines()
            packages[next(v[6:] for v in fields if v.startswith('Name: '))] = next(v[9:] for v in fields if v.startswith('Version: '))
        entries = [(p, 'palm/' + p.name) for p in (BACKEND / 'palm').glob('*.py')]
        entries.append((BACKEND / 'palm/local_data_fields.json', 'palm/local_data_fields.json'))
        # Only the shared HTTP transport is needed; no probe routes or test runner are deployed.
        entries += [(BACKEND / 'cloudbase_probe' / name, 'cloudbase_probe/' + name) for name in ('__init__.py', 'client.py')]
        entries += [(ROOT / 'api' / name, name) for name in ('app.py', 'scf_bootstrap', 'requirements.txt')]
        entries += [(p, p.relative_to(stage).as_posix()) for p in vendor.rglob('*') if p.is_file()
                    and not any(part in ('tests', 'test', 'SelfTest', '__pycache__') for part in p.relative_to(vendor).parts)]
        bundle(ROOT / 'palm-api-python310.zip', entries, {'runtime': 'Python 3.10 Linux x64', 'packages': packages,
            'storage': 'cloudbase-only', 'photos': 'private-cos-header-tickets-disabled-by-default',
            'crcmod': 'official_pure_python_fallback', 'business_data_included': False})
    if python_only: return
    bridge = ROOT / 'bridge'
    if not (bridge / 'node_modules/@cloudbase/node-sdk/package.json').exists():
        raise RuntimeError('Install bridge dependencies with npm ci before building')
    entries = [(bridge / name, name) for name in ('index.js', 'package.json', 'package-lock.json')]
    entries += [(p, p.relative_to(bridge).as_posix()) for p in (bridge / 'node_modules').rglob('*')
                if p.is_file() and not any(part in ('__pycache__', 'tests', 'test', '.git') for part in p.parts)
                and p.suffix not in ('.pyc', '.pyd')]
    bundle(ROOT / 'palm-api-bridge-node20.zip', entries, {'runtime': 'Node.js 20', 'sdk': '3.18.3',
        'business_data_included': False})


if __name__ == '__main__': build(python_only='--python-only' in sys.argv)
