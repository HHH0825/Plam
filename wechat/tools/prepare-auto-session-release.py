"""Package the client only from the verified build. Never deploy or upload."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[2]
wechat = root / 'wechat'
project = wechat / 'miniprogram'
out = wechat / 'deploy/cloudbase/auto-session-20261025'
out.mkdir(parents=True, exist_ok=True)
build = json.loads((root / 'test-results/beauty-icons-build.json').read_text(encoding='utf-8'))
runtime, sources = {}, {}
digest = lambda raw: hashlib.sha256(raw).hexdigest()
for row in build['files']:
    name = row['name']
    assert not any(s in name for s in ('qa-fixture', 'project.private', 'node_modules/'))
    source = (project / name).read_bytes()
    compiled = (root / 'test-results/beauty-icons-project' / name).read_bytes()
    assert digest(source) == row['sourceSha256'] and digest(compiled) == row['sha256'], name
    runtime[name] = compiled
    sources['miniprogram/' + name] = source
for folder, patterns in [('tests', ('*.cjs',)), ('tools', ('*auto-session*',))]:
    for pattern in patterns:
        for p in (wechat / folder).glob(pattern):
            if p.is_file():
                sources[folder + '/' + p.name] = p.read_bytes()
sources['docs/auto-session-20261025.md'] = (wechat / 'docs/auto-session-20261025.md').read_bytes()
bundles = []
for name, entries in [('catpaw-miniprogram.zip', runtime), ('catpaw-client-source.zip', sources)]:
    p = out / name
    with zipfile.ZipFile(p, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, raw in entries.items():
            z.writestr(n, raw)
    with zipfile.ZipFile(p) as z:
        assert z.testzip() is None and all(z.read(n) == raw for n, raw in entries.items())
    sha = digest(p.read_bytes())
    p.with_suffix('.zip.sha256').write_text(sha + '  ' + name + '\n', encoding='utf-8')
    bundles.append({'file': name, 'bytes': p.stat().st_size, 'sha256': sha})
manifest = {'release': 'auto-session-20261025', 'bundles': bundles, 'client_only': True,
            'backend_changed': False, 'database_migration': False, 'deployed': False, 'uploaded': False,
            'source_packages': build['sourcePackages'], 'built_packages': build['builtPackages'],
            'pages': 25, 'manual': 'wechat/docs/auto-session-20261025.md'}
(out / 'release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
