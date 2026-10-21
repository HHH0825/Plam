"""Current offline packaging entry. No historical deployment ZIP is required.

Build the frontend with build-beauty-icons.cjs first. Existing current API and
bridge archives supply pinned Linux/Node dependencies only when sources change.
"""
from pathlib import Path
import ast
import hashlib
import importlib.util
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
WECHAT = ROOT / 'wechat'
DEPLOY = WECHAT / 'deploy/cloudbase'
OUT = DEPLOY / 'beauty-icons-20261018'
BASELINE = OUT
FRONTEND_API_ONLY = False
STAGE = ROOT / 'test-results/current-release-bundles'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def info(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, path
        size = sum(i.file_size for i in archive.infolist())
    sha = digest(path.read_bytes())
    path.with_suffix('.zip.sha256').write_text(sha + '  ' + path.name + '\n', encoding='utf-8')
    return {'file': path.name, 'bytes': path.stat().st_size, 'uncompressed_bytes': size, 'sha256': sha}


def update_zip(name, entries):
    """Keep existing archive bytes/hash when all member contents are unchanged."""
    target = OUT / name
    previous = {}
    if target.exists():
        with zipfile.ZipFile(target) as z:
            previous = {i.filename: i for i in z.infolist()}
            if set(previous) == set(entries) and all(z.read(n) == raw for n, raw in entries.items()):
                return info(target)
    candidate = STAGE / name
    with zipfile.ZipFile(candidate, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, raw in entries.items():
            z.writestr(previous.get(name, name), raw)
    with zipfile.ZipFile(candidate) as z:
        assert z.testzip() is None
    shutil.copy2(candidate, target)
    assert digest(candidate.read_bytes()) == digest(target.read_bytes())
    candidate.unlink()
    return info(target)


def runtime_bundle(name, prefix, sources):
    target = OUT / name
    baseline = target if target.exists() else BASELINE / name
    with zipfile.ZipFile(baseline) as z:
        assert z.testzip() is None
        if all(z.read(n) == p.read_bytes().replace(b'\r\n', b'\n') for p, n in sources):
            if target != baseline:
                shutil.copy2(baseline, target)
            return info(target)
    spec = importlib.util.spec_from_file_location('offline_bundle', WECHAT / 'tools/prepare-purchases-release.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    builder.OUTPUT = STAGE
    builder.RELEASE = OUT.name
    builder.build(name, baseline, prefix, sources)
    shutil.copy2(STAGE / name, target)
    assert digest((STAGE / name).read_bytes()) == digest(target.read_bytes())
    (STAGE / name).unlink()
    (STAGE / name).with_suffix('.zip.sha256').unlink()
    return info(target)


def main():
    STAGE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    project = WECHAT / 'miniprogram'
    built = ROOT / 'test-results/beauty-icons-project'
    build = json.loads((ROOT / 'test-results/beauty-icons-build.json').read_text(encoding='utf-8'))
    frontend, editable = {}, {}
    for row in build['files']:
        name = row['name']
        assert not any(s in name for s in ('qa-fixture', 'api-original', 'project.private', 'node_modules/'))
        source, output = (project / name).read_bytes(), (built / name).read_bytes()
        assert digest(source) == row['sourceSha256'] and digest(output) == row['sha256'], name
        frontend[name] = output
        editable['miniprogram/' + name] = source
    assert sum(map(len, frontend.values())) == build['bytes']
    for key in ('sourcePackages', 'builtPackages'):
        assert max(build[key]['packages'].values()) <= build[key]['budgetBytes'] < 2 * 1024 * 1024
        assert build[key]['mainBytes'] <= build[key]['mainBudgetBytes'] == 1450000
    for folder in ('item-covers-20261011', 'item-covers-20261018', 'beauty-icons-20261018'):
        for p in sorted((WECHAT / 'branding' / folder).glob('*')):
            if p.suffix in ('.svg', '.json'):
                editable['branding/' + folder + '/' + p.name] = p.read_bytes()
    for p in sorted((WECHAT / 'branding/code-quality-20261019').glob('*')):
        if p.suffix in ('.png', '.json'):
            editable['branding/code-quality-20261019/' + p.name] = p.read_bytes()
    for p in sorted((WECHAT / 'branding/startup-share-20261020').glob('*')):
        if p.suffix in ('.svg', '.png', '.json'):
            editable['branding/startup-share-20261020/' + p.name] = p.read_bytes()
    cat_source = WECHAT / 'branding/member-notice-icon-20261017/announcement.svg'
    editable['branding/member-notice-icon-20261017/announcement.svg'] = cat_source.read_bytes()
    for name in ('prepare-beauty-icons.cjs', 'build-beauty-icons.cjs', 'package-sizes.cjs', 'extract-wechat-terser.py',
                 'prepare-current-release.py', 'prepare-purchases-release.py', 'prepare-quality-hero.cjs',
                 'prepare-theme-refresh.cjs', 'prepare-book-comic-covers.cjs', 'prepare-growth-art.cjs',
                 'prepare-rewards-art.cjs', 'prepare-invitation-art.cjs'):
        editable['tools/' + name] = (WECHAT / 'tools' / name).read_bytes()
    api_sources = [(p, 'palm/' + p.name) for p in sorted((WECHAT / 'backend/palm').glob('*.py'))]
    api_sources += [(WECHAT / 'backend/cloudbase_probe' / n, 'cloudbase_probe/' + n) for n in ('__init__.py', 'client.py')]
    api_sources += [(DEPLOY / 'api' / n, n) for n in ('app.py', 'scf_bootstrap', 'requirements.txt')]
    for p, name in api_sources:
        if name.endswith('.py'):
            ast.parse(p.read_text(encoding='utf-8'), feature_version=(3, 10))
    bridge_sources = [(DEPLOY / 'bridge' / n, n) for n in ('index.js', 'package.json', 'package-lock.json')]
    for p, name in api_sources:
        editable['backend/' + name] = p.read_bytes()
    editable['backend/dev.py'] = (WECHAT / 'backend/dev.py').read_bytes()
    editable['docs/api.md'] = (WECHAT / 'docs/api.md').read_bytes()
    release_notes = WECHAT / 'docs/subscriptions-20261021.md'
    if release_notes.exists():
        editable['docs/subscriptions-20261021.md'] = release_notes.read_bytes()
    for name in ('prepare-fixed-expense-sandbox.cjs', 'verify-fixed-expense-quick-add.cjs', 'verify-fixed-expense-native.ps1'):
        editable['tools/' + name] = (WECHAT / 'tools' / name).read_bytes()
    for p in sorted((WECHAT / 'tests').iterdir()):
        if p.suffix in ('.py', '.cjs') and p.is_file():
            editable['tests/' + p.name] = p.read_bytes()
    bundles = [update_zip('catpaw-miniprogram.zip', frontend),
               runtime_bundle('palm-api-beauty-icons-python310.zip', 'third_party/', api_sources),
               update_zip('catpaw-editable-source-and-icons.zip', editable)]
    if not FRONTEND_API_ONLY:
        bundles.append(runtime_bundle('palm-api-bridge-node20.zip', 'node_modules/', bridge_sources))
    with zipfile.ZipFile(OUT / bundles[1]['file']) as api:
        assert 'third_party/PIL/_imaging.cpython-310-x86_64-linux-gnu.so' in api.namelist()
        assert (api.getinfo('scf_bootstrap').external_attr >> 16) & 0o777 == 0o755
        assert not any(n.endswith(('.pyd', '.sqlite3', '.env', '.pyc')) or '/__pycache__/' in n for n in api.namelist())
    manifest_path = OUT / 'upload-manifest.json'
    template = manifest_path if manifest_path.exists() else BASELINE / 'upload-manifest.json'
    manifest = json.loads(template.read_text(encoding='utf-8'))
    manifest['bundles'] = bundles
    manifest['runtime_build'].update(source_bytes=build['sourceBytes'], bytes=build['bytes'])
    manifest['runtime_build'].update(source_packages=build['sourcePackages'], built_packages=build['builtPackages'],
                                     main_source_bytes=build['sourcePackages']['mainBytes'], main_bytes=build['builtPackages']['mainBytes'])
    manifest.setdefault('launch_cleanup', {}).update({'local_only': True, 'business_changes': False, 'deployed': False,
                                  'real_data_modified': False, 'current_build_entry': 'wechat/tools/prepare-current-release.py',
                                  'historical_build_scripts': 'archived one-off recipes; use current entry for new builds'})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    shutil.copy2(ROOT / 'test-results/beauty-icons-build.json', OUT / 'build-manifest.json')
    print(json.dumps({'bundles': bundles, 'frontend_bytes': build['bytes']}, ensure_ascii=False))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--baseline-dir', type=Path)
    parser.add_argument('--frontend-api-only', action='store_true')
    args = parser.parse_args()
    if args.baseline_dir:
        BASELINE = args.baseline_dir.resolve()
    if args.output_dir:
        OUT = args.output_dir.resolve()
        if not OUT.is_relative_to(DEPLOY.resolve()):
            parser.error('Output must stay inside wechat/deploy/cloudbase')
    FRONTEND_API_ONLY = args.frontend_api_only
    main()
