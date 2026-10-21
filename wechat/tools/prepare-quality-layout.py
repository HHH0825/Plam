"""One-time relocation of package-private modules/assets, with a hash inventory."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'wechat/miniprogram'
OUT = ROOT / 'test-results/code-quality'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    before = OUT / 'before.json'
    if before.exists():
        raise RuntimeError('Relocation already inventoried; do not run twice')
    rows = {p.relative_to(APP).as_posix(): {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in APP.rglob('*') if p.is_file()}
    before.write_text(json.dumps({'files': rows, 'build': json.loads((ROOT / 'test-results/beauty-icons-build.json').read_text(encoding='utf-8'))}, indent=2), encoding='utf-8')
    modules = {'appearance-preview': 'member-tools', 'book-sort': 'member-tools', 'cover-picker': 'editor',
               'drafts': 'editor', 'item-category': 'editor', 'location-picker': 'editor',
               'expense-progress': 'fixed-expenses', 'member-announcement': 'membership',
               'virtual-payment': 'membership', 'member-benefits': 'member-benefits'}
    mapping = {'utils/' + name + '.js': 'pages/' + page + '/lib/' + name + '.js' for name, page in modules.items()}
    assets = {'assets/welcome-collection': 'pages/login/assets', 'assets/book-comic': 'pages/member-tools/assets/book-covers',
              'assets/stickers/collector.png': 'pages/member-benefits/assets/collector.png',
              'assets/membership/unlimited.png': 'pages/membership/assets/unlimited.png',
              'assets/rewards/extra-space.png': 'pages/rewards/assets/extra-space.png'}
    for old, new in assets.items():
        source = APP / old
        if source.is_dir():
            mapping.update({p.relative_to(APP).as_posix(): new + '/' + p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file()})
        else:
            mapping[old] = new
    master = ROOT / 'wechat/branding/code-quality-20261019/login-hero-master.png'
    master.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(APP / 'assets/welcome-collection/hero.png', master)
    edits = {}
    for p in APP.rglob('*'):
        if not p.is_file() or p.suffix not in ('.js', '.wxml', '.wxss', '.json'):
            continue
        old = p.relative_to(APP).as_posix()
        new = mapping.get(old, old)
        text = p.read_text(encoding='utf-8')
        original = text
        if p.suffix == '.js':
            def replace(match):
                spec = match[2]
                if not spec.startswith('.'):
                    return match[0]
                target = (p.parent / spec).resolve()
                if target.suffix != '.js':
                    target = target.with_suffix('.js')
                if not target.is_relative_to(APP) or not target.exists():
                    return match[0]
                dest = APP / mapping.get(target.relative_to(APP).as_posix(), target.relative_to(APP).as_posix())
                relative = os.path.relpath(dest, (APP / new).parent).replace('\\', '/')
                if not spec.endswith('.js'):
                    relative = relative.removesuffix('.js')
                if not relative.startswith('.'):
                    relative = './' + relative
                return 'require(' + match[1] + relative + match[1] + ')'
            text = re.sub(r'require\(([\'"])([^\'"]+)\1\)', replace, text)
        if old == 'pages/login/index.wxss':
            text = text.replace('../../assets/welcome-collection/frame.wxss', './assets/frame.wxss')
        for source, target in assets.items():
            text = text.replace('/' + source + '/', '/' + target + '/') if '.' not in Path(source).name else text.replace('/' + source, '/' + target)
        if old == 'project.config.json':
            data = json.loads(text)
            for key in ('ignore', 'include'):
                for rule in data['packOptions'][key]:
                    if rule['type'] == 'file':
                        rule['value'] = mapping.get(rule['value'], rule['value'])
            text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
        if text != original:
            edits[old] = text
    for old, new in mapping.items():
        source, target = (APP / old).resolve(), (APP / new).resolve()
        assert source.is_relative_to(APP) and target.is_relative_to(APP) and not target.exists()
        target.parent.mkdir(parents=True, exist_ok=True)
        source.rename(target)
    for old, text in edits.items():
        (APP / mapping.get(old, old)).write_text(text, encoding='utf-8')
    config = APP / 'app.json'
    app = json.loads(config.read_text(encoding='utf-8'))
    for name in ('login', 'member-benefits'):
        app['pages'].remove('pages/' + name + '/index')
        app['subPackages'].append({'root': 'pages/' + name, 'name': name, 'pages': ['index']})
    config.write_text(json.dumps(app, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Update imports in the behavior tests; specialized mocks are reviewed after
    # relocation, since their dependency stubs must match the real new paths.
    for p in (ROOT / 'wechat/tests').glob('*.cjs'):
        text = p.read_text(encoding='utf-8')
        for old, new in mapping.items():
            text = text.replace('../miniprogram/' + old.removesuffix('.js'), '../miniprogram/' + new.removesuffix('.js'))
        p.write_text(text, encoding='utf-8') if text != p.read_text(encoding='utf-8') else None
    (OUT / 'relocations.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'moved_files': len(mapping), 'private_modules': len(modules), 'edited_runtime_files': len(edits)}))


if __name__ == '__main__':
    main()
