"""Offline candidate delivery. Does not deploy, publish, or read user data."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
WECHAT = ROOT / 'wechat'
BUILD = ROOT / 'test-results/local-builds'
OUT = WECHAT / 'deploy/local-direct-20261106'
RELEASE = 'local-direct-20261106'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(name):
    if name.startswith(('/', '\\')) or '\\' in name or any(p in ('..', '') for p in name.split('/')):
        raise ValueError('Unsafe archive path: ' + name)
    if any(p in ('node_modules', '__pycache__', '.git', 'instance') for p in name.split('/')):
        raise ValueError('Unexpected source directory: ' + name)
    if re.search(r'(^|/)(\.env(?:\..*)?|project\.private.*|env(?:\.local)?\.json)$', name):
        raise ValueError('Private configuration: ' + name)
    if name.endswith(('.pem', '.key', '.sqlite', '.sqlite3', '.db', '.pyc')):
        raise ValueError('Private/runtime file: ' + name)
    return name


def bundle(name, entries):
    target = OUT / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for member, data in sorted(entries.items()):
            safe_name(member)
            info = zipfile.ZipInfo(member)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, data)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None or len(archive.namelist()) != len(entries):
            raise RuntimeError('Archive verification failed: ' + name)
        for member, raw in entries.items():
            if digest(archive.read(member)) != digest(raw):
                raise RuntimeError('Archive mismatch: ' + member)
    return {'file': name, 'bytes': target.stat().st_size, 'sha256': digest(target.read_bytes()), 'files': len(entries)}


def frontend(variant):
    manifest = json.loads((BUILD / (variant + '-manifest.json')).read_text(encoding='utf-8'))
    for row in manifest['inputs']:
        path = (WECHAT / 'tools/local-template' / row['name'].split('/', 1)[1]
                if row['name'].startswith('@template/') else WECHAT / 'miniprogram' / row['name'])
        if digest(path.read_bytes()) != row['sha256']:
            raise RuntimeError('Source changed; rebuild first: ' + row['name'])
    reports = []
    for editable in (False, True):
        folder = BUILD / (variant + ('-source' if editable else ''))
        entries = {}
        for row in manifest['files']:
            raw = (folder / row['name']).read_bytes()
            if digest(raw) != row['sourceSha256' if editable else 'sha256']:
                raise RuntimeError('Generated project changed; rebuild first: ' + row['name'])
            entries[row['name']] = raw
        sizes = manifest['sourcePackages' if editable else 'builtPackages']
        if sizes['mainBytes'] > 1450000 or manifest['pages'] != 26:
            raise RuntimeError('Package budget/page contract failed')
        report = bundle('catpaw-' + variant + ('-editable.zip' if editable else '-miniprogram.zip'), entries)
        reports.append({**report, 'variant': variant, 'editable': editable, 'packages': sizes})
    return reports


def source_backup():
    entries = {}
    def add(path):
        if path.is_file():
            name = path.relative_to(ROOT).as_posix()
            safe_name(name)
            entries[name] = path.read_bytes()
    manifest = json.loads((BUILD / 'local-manifest.json').read_text(encoding='utf-8'))
    for row in manifest['inputs']:
        if not row['name'].startswith('@template/'):
            add(WECHAT / 'miniprogram' / row['name'])
    tracked = subprocess.check_output(
        ['git', 'ls-files', '-z', 'wechat/tests', 'wechat/tools', 'wechat/local-core', 'wechat/docs'],
        cwd=ROOT,
    ).decode().split('\0')
    for name in filter(None, tracked):
        path = ROOT / name
        if name.startswith(('wechat/tests/', 'wechat/tools/', 'wechat/local-core/')):
            if path.suffix not in ('.py', '.js', '.cjs', '.json', '.md'):
                continue
        if path.suffix not in ('.zip', '.sha256', '.log'):
            add(path)
    for name in ('README.md', 'LICENSE', 'NOTICE', '.gitignore', '.gitattributes'):
        add(WECHAT / name)
    return bundle('catpaw-local-first-source.zip', entries)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    frontlog = (ROOT / 'test-results/local-frontend-20261106.log').read_text(encoding='utf-8')
    frontend_count = re.search(r'tests (\d+)\b', frontlog)
    frontend_count = int(frontend_count.group(1)) if frontend_count else 0
    if frontend_count < 582 or not re.search(r'pass ' + str(frontend_count) + r'\b', frontlog) or not re.search(r'fail 0\b', frontlog) or not re.search(r'skipped 0\b', frontlog):
        raise RuntimeError('Missing complete successful frontend evidence')
    native = json.loads((ROOT / 'test-results/local-native-compile-20261106.json').read_text(encoding='utf-8-sig'))
    if len(native) != 26 or any(not row[kind]['ok'] or not row[kind]['result']['success'] for row in native for kind in ('compile_wxml', 'compile_wxss')):
        raise RuntimeError('Missing complete native page compilation evidence')
    final_native = json.loads((ROOT / 'test-results/local-native-final-20261106.json').read_text(encoding='utf-8-sig'))
    if len(final_native) != 8 or any(not r['response']['ok'] or not r['response']['result']['success'] for r in final_native):
        raise RuntimeError('Final changed-page compilation failed')
    reports = frontend('local')
    reports.append(source_backup())
    for name in ('local-first-release.md', 'local-first-implementation.md', 'local-first-privacy.txt', 'local-first-cloud-shutdown.md'):
        shutil.copyfile(WECHAT / 'docs' / name, OUT / name)
    evidence = OUT / 'verification'
    evidence.mkdir(exist_ok=True)
    for name in ('local-frontend-20261106.log', 'local-backend-20261106.log', 'local-native-compile-20261106.json', 'local-native-acceptance-20261106.json', 'local-native-final-20261106.json', 'local-native-data-20261106.png', 'local-native-items-20261106.png', 'local-native-notice-20261106.png', 'local-native-me-20261106.png', 'local-native-export-cache-20261106.json'):
        source = ROOT / 'test-results' / name
        if source.exists():
            shutil.copyfile(source, evidence / name)
    layout = ROOT / 'test-results/local-direct-layout-20261106'
    for path in layout.iterdir():
        if path.suffix in ('.png', '.json'):
            shutil.copyfile(path, evidence / path.name)
    checks = json.loads((evidence / 'checks.json').read_text(encoding='utf-8'))
    if len(checks['checks']) != 15:
        raise RuntimeError('Missing layout evidence')
    me_layout = ROOT / 'test-results/local-me-layout-20261106'
    me_checks = json.loads((me_layout / 'checks.json').read_text(encoding='utf-8'))
    if len(me_checks['checks']) != 20:
        raise RuntimeError('Missing profile-menu layout evidence')
    (evidence / 'me').mkdir(exist_ok=True)
    for path in me_layout.iterdir():
        if path.suffix in ('.png', '.json'):
            shutil.copyfile(path, evidence / 'me' / path.name)
    preview = '<!doctype html><meta charset="utf-8"><title>猫爪物账本地候选预览</title><style>body{margin:24px;background:#faf9f3;color:#383731;font:16px sans-serif}section{display:flex;gap:18px;flex-wrap:wrap}figure{margin:0;width:320px}img{width:100%;border:1px solid #ddd;border-radius:16px}</style><h1>本地候选版预览</h1><p>虚构资料离线排版预览；不代表安卓／苹果真机验收。</p><section>'
    for name, title in [('me/pending-390.png', '我的：常用工具与备份状态'), ('local-data-390.png', '资料与完整备份'), ('recovery-390.png', '损坏恢复'), ('backup-ready-390.png', '备份与恢复预览')]:
        preview += f'<figure><figcaption>{title}</figcaption><a href="verification/{name}"><img src="verification/{name}" alt="{title}"></a></figure>'
    (OUT / 'preview.html').write_text(preview + '</section>', encoding='utf-8')
    for row in reports:
        (OUT / (row['file'] + '.sha256')).write_text(row['sha256'] + '  ' + row['file'] + '\n', encoding='utf-8')
    evidence_rows = [{'file': p.relative_to(OUT).as_posix(), 'sha256': digest(p.read_bytes())} for p in sorted(evidence.rglob('*')) if p.is_file()]
    report = {'release': RELEASE, 'publicationMode': 'direct-local', 'automaticCloudMigration': False, 'backend_update_required': False, 'candidate': True, 'deployed': False, 'uploaded': False, 'real_accounts_modified': False,
              'verification': {'frontend_passed': frontend_count, 'historical_backend_passed': 431, 'layout_cases': 15, 'profile_layout_cases': 20, 'physical_phones_verified': False, 'real_cloudbase_deployment_verified': False},
              'bundles': reports, 'evidence': evidence_rows}
    upload_record = OUT / 'upload-result-20261106.json'
    if upload_record.exists():
        uploaded = json.loads(upload_record.read_text(encoding='utf-8'))
        current = next(r for r in reports if r['file'] == 'catpaw-local-miniprogram.zip')
        if uploaded.get('success') is True and uploaded.get('project_zip_sha256') == current['sha256']:
            report.update(uploaded=True, upload=uploaded, published=False)
    (OUT / 'release-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    rows = [p for p in OUT.rglob('*') if p.is_file() and p.name != 'SHA256SUMS.txt' and not p.name.endswith('.sha256')]
    (OUT / 'SHA256SUMS.txt').write_text(''.join(digest(p.read_bytes()) + '  ' + p.relative_to(OUT).as_posix() + '\n' for p in sorted(rows)), encoding='utf-8')
    print(json.dumps({'output': str(OUT), 'bundles': [{'file': r['file'], 'bytes': r['bytes']} for r in reports]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
