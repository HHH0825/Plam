"""Inventory local cleanup targets and preserve editable art before deletion."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
WECHAT = ROOT / 'wechat'
DEPLOY = WECHAT / 'deploy'
OUT = DEPLOY / 'cloudbase/beauty-icons-20261018'
REPORT = OUT / '上线清尾清单.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def row(path):
    return {'path': str(path.resolve()), 'bytes': path.stat().st_size, 'sha256': digest(path)}


def main():
    if REPORT.exists():
        raise RuntimeError('Cleanup inventory already exists; review it rather than overwrite evidence')
    keep_dirs = {OUT.resolve(), (DEPLOY / 'cloudbase/cover-expansion-20261018').resolve()}
    archives = sorted(DEPLOY.rglob('*.zip'))
    retained = [p for p in archives if p.parent.resolve() in keep_dirs]
    assert len(retained) == 6
    for p in retained:
        assert digest(p) == p.with_suffix('.zip.sha256').read_text(encoding='utf-8-sig').split()[0]
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None
    bridge = DEPLOY / 'cloudbase/growth-20261018/palm-api-bridge-growth-node20.zip'
    with zipfile.ZipFile(bridge) as z:
        assert z.testzip() is None
        for name in ('index.js', 'package.json', 'package-lock.json'):
            assert z.read(name).replace(b'\r\n', b'\n') == (DEPLOY / 'cloudbase/bridge' / name).read_bytes().replace(b'\r\n', b'\n')
    reusable = OUT / 'palm-api-bridge-node20.zip'
    shutil.copy2(bridge, reusable)
    assert digest(bridge) == digest(reusable)
    reusable.with_suffix('.zip.sha256').write_text(digest(reusable) + '  ' + reusable.name + '\n', encoding='utf-8')
    deletions = []
    for p in archives:
        if p not in retained:
            deletions.append({**row(p), 'kind': 'obsolete_deployment_zip'})
            checksum = p.with_suffix('.zip.sha256')
            if checksum.exists():
                deletions.append({**row(checksum), 'kind': 'obsolete_zip_checksum'})

    project = WECHAT / 'miniprogram'
    config = json.loads((project / 'project.config.json').read_text(encoding='utf-8'))
    includes = {r['value'] for r in config['packOptions']['include'] if r['type'] == 'file'}
    excluded = [project / r['value'] for r in config['packOptions']['ignore']
                if r['type'] == 'file' and r['value'] not in includes and (project / r['value']).suffix == '.png'
                and (project / r['value']).is_file()]
    assert len(excluded) == 85
    runtime = [(p, p.read_text(encoding='utf-8-sig')) for p in project.rglob('*')
               if p.suffix in ('.js', '.json', '.wxml', '.wxss') and not p.name.startswith('project.')]
    art = WECHAT / 'branding/retired-runtime-assets-20261018'
    evidence = []
    for p in excluded:
        relative = p.relative_to(project).as_posix()
        assert not any(relative in text for _, text in runtime), relative
        # Each explicitly excluded PNG has either an editable vector source or
        # a retained bitmap master. Never discard the only artwork source.
        source = p.with_suffix('.svg') if p.with_suffix('.svg').exists() else p
        target = art / source.relative_to(project / 'assets')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        assert digest(source) == digest(target)
        evidence.append({'runtime': relative, 'preserved_art': str(target.resolve()), 'art_sha256': digest(target),
                         'already_excluded_from_upload': True})
        deletions.append({**row(p), 'kind': 'excluded_unused_runtime_png'})
        if source != p:
            assert not any(source.relative_to(project).as_posix() in text for _, text in runtime)
            deletions.append({**row(source), 'kind': 'relocated_unused_runtime_svg'})
    manifest = {'scope': 'local files only; no cloud actions', 'retained_releases': [str(p) for p in sorted(keep_dirs)],
                'before_zip_count': len(archives), 'before_zip_bytes': sum(p.stat().st_size for p in archives),
                'retained_packages': [row(p) for p in retained + [reusable]], 'art_evidence': evidence,
                'delete_files': deletions, 'deleted': False}
    REPORT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'report': str(REPORT), 'delete_zip_count': sum(r['kind'] == 'obsolete_deployment_zip' for r in deletions),
                      'unused_pngs': len(excluded), 'delete_bytes': sum(r['bytes'] for r in deletions)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
