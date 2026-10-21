"""Deliver offline-verified front-end, editable art and the API. Never deploy."""
from pathlib import Path
import ast
import hashlib
import importlib.util
import json
import re
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
deploy = root / 'deploy/cloudbase'
out = deploy / 'cover-expansion-20261018'
out.mkdir(parents=True, exist_ok=True)
proof = root / 'docs/images/cover-expansion-20261018'
project = root / 'miniprogram'
built = root.parent / 'test-results/cover-expansion-project'
build = json.loads((root.parent / 'test-results/cover-expansion-build.json').read_text(encoding='utf-8'))
results = {name: json.loads((proof / name).read_text(encoding='utf-8-sig')) for name in ('layout-results.json', 'compile-results.json', 'native-results.json', 'asset-results.json', 'build-visual-parity.json')}
assert all(r['passed'] for r in results.values())
assert json.loads((proof / 'packed/layout-results.json').read_text(encoding='utf-8'))['passed']


def log(name):
    raw = (root.parent / 'test-results' / name).read_bytes()
    return raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')


tests = {}
for name in ('frontend', 'packed'):
    text = log('cover-expansion-' + name + '.log')
    count = int(re.search(r'# tests (\d+)', text).group(1))
    assert f'# pass {count}' in text and '# fail 0' in text
    tests[name] = count
backend_log = log('cover-expansion-backend-regression.log')
backend_count = int(re.search(r'Ran (\d+) tests', backend_log).group(1))
assert backend_log.rstrip().endswith('OK')
catalogue = json.loads((root / 'branding/item-covers-20261018/catalogue.json').read_text(encoding='utf-8'))
new_art = {'assets/item-covers/' + row['key'] + '.png' for row in catalogue if row.get('version') == 2}
assert len(catalogue) == 90 and len(new_art) == 50
names = {r['name'] for r in build['files']}
assert not any('qa-fixture' in n or 'api-original' in n or 'project.private' in n for n in names)
with zipfile.ZipFile(deploy / 'discovery-journal-20261018/catpaw-miniprogram.zip') as prior:
    changed = sorted(n for n in names if n not in prior.namelist() or (project / n).read_bytes() != prior.read(n))
    assert not set(prior.namelist()) - names
    assert set(changed) == new_art | {'utils/item-cover-catalogue.js', 'utils/item-covers.js', 'utils/cover-picker.js', 'pages/editor/index.js', 'pages/editor/index.wxml'}
    for name in prior.namelist():
        if name.endswith('.png'):
            assert prior.read(name) == (project / name).read_bytes(), name


def finish_bundle(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        total = sum(i.file_size for i in archive.infolist())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    path.with_suffix('.zip.sha256').write_text(digest + '  ' + path.name + '\n', encoding='utf-8')
    return {'file': path.name, 'sha256': digest, 'bytes': path.stat().st_size, 'uncompressed_bytes': total}


front = out / 'catpaw-miniprogram.zip'
with zipfile.ZipFile(front, 'w', zipfile.ZIP_DEFLATED) as archive:
    for row in build['files']:
        raw = (project / row['name']).read_bytes()
        data = (built / row['name']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == row['sourceSha256']
        assert hashlib.sha256(data).hexdigest() == row['sha256']
        archive.writestr(row['name'], data)
front_info = finish_bundle(front)
assert front_info['uncompressed_bytes'] == build['bytes'] < 2 * 1024 * 1024

editable = out / 'catpaw-editable-source-and-icons.zip'
with zipfile.ZipFile(editable, 'w', zipfile.ZIP_DEFLATED) as archive:
    for row in build['files']:
        archive.write(project / row['name'], 'miniprogram/' + row['name'])
    for folder in ('item-covers-20261011', 'item-covers-20261018'):
        for p in sorted((root / 'branding' / folder).glob('*')):
            if p.suffix in ('.svg', '.json'):
                archive.write(p, 'branding/' + folder + '/' + p.name)
    for name in ('prepare-cover-expansion.cjs', 'build-cover-expansion.cjs', 'extract-wechat-terser.py'):
        archive.write(root / 'tools' / name, 'tools/' + name)
editable_info = finish_bundle(editable)

sources = [(p, 'palm/' + p.name) for p in sorted((root / 'backend/palm').glob('*.py'))]
sources += [(root / 'backend/cloudbase_probe' / n, 'cloudbase_probe/' + n) for n in ('__init__.py', 'client.py')]
sources += [(deploy / 'api' / n, n) for n in ('app.py', 'scf_bootstrap', 'requirements.txt')]
baseline = deploy / 'income-categories-20261018/palm-api-income-categories-python310.zip'
with zipfile.ZipFile(baseline) as archive:
    api_changed = [n for p, n in sources if p.read_bytes().replace(b'\r\n', b'\n') != archive.read(n).replace(b'\r\n', b'\n')]
assert api_changed == ['palm/covers.py', 'palm/routes_auth.py']
for p, name in sources:
    if name.endswith('.py'):
        ast.parse(p.read_text(encoding='utf-8'), feature_version=(3, 10))
spec = importlib.util.spec_from_file_location('builder', root / 'tools/prepare-purchases-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.OUTPUT = out
builder.RELEASE = out.name
api = builder.build('palm-api-cover-expansion-python310.zip', baseline, 'third_party/', sources)
with zipfile.ZipFile(out / api['file']) as archive:
    assert all(archive.read(n) == p.read_bytes().replace(b'\r\n', b'\n') for p, n in sources)
api_info = finish_bundle(out / api['file'])
manifest = {'release': out.name, 'deployed': False, 'real_data_modified': False, 'new_icons': 50, 'total_icons': 90,
    'new_png_bytes': results['asset-results.json']['newBytes'], 'existing_pngs_unchanged': True, 'catalogue_version': 2,
    'changed_frontend_sources': changed, 'changed_api_files': api_changed, 'frontend_tests': tests,
    'backend_tests': backend_count, 'layout_checks': 36, 'built_layout_checks': 36,
    'wechat_compile_checks': len(results['compile-results.json']['checks']), 'native_checks': len(results['native-results.json']['checks']),
    'runtime_build': {'source_bytes': build['sourceBytes'], 'bytes': build['bytes'], 'compiler': build['compiler'], 'properties_mangled': False, 'kept_function_and_class_names': True},
    'python310_syntax_verified': True, 'real_device_verified': False, 'bundles': [front_info, api_info, editable_info]}
(out / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
for name in results:
    shutil.copy2(proof / name, out / name)
shutil.copy2(proof / 'packed/layout-results.json', out / 'packed-layout-results.json')
for name in ('cover-expansion-frontend.log', 'cover-expansion-packed.log', 'cover-expansion-backend-regression.log'):
    shutil.copy2(root.parent / 'test-results' / name, out / name)
shutil.copy2(root.parent / 'test-results/cover-expansion-build.json', out / 'build-manifest.json')
shots = out / '截图'
shots.mkdir(exist_ok=True)
for name in ('picker-native.png', 'editor-native.png', 'legacy-native.png', 'picker-390.png', 'picker-large-320.png', 'detail-390.png', 'list-390.png'):
    shutil.copy2(proof / name, shots / name)
shutil.copy2(root / 'branding/item-covers-20261018/50个新增图标总览.png', out / '50个新增图标总览.png')
manual = f'''# 物品图标补齐为90个

## 本次内容

新增50个常用物品图标，覆盖键鼠和数码配件、家电、个人护理、衣物配饰、文具、出行、运动、工具与收藏品。完整清单和外观见“50个新增图标总览.png”。原有40个图标编号及PNG字节保持不变；其他已有图片也未改动。新增PNG共{manifest['new_png_bytes']:,}字节，全部128×128透明底，低于120KiB目标。可编辑SVG在可编辑源码包的branding目录。

搜索支持“墨水屏／读书器→电子书阅读器”“移动电源→充电宝”“香氛→香水”“优盘→U盘”等别名。选择图标只改封面，不改变分类或物品类型。原照片替换确认、取消、草稿、冲突处理及容量规则保持不变。

## 逐步更新

1. 保留当前前后端备份。将catpaw-miniprogram.zip解压到一个新目录，再导入微信开发者工具；不要把截图、源码备份和SVG素材放入这个目录。先准备、编译和检查前端，暂不发布。旧服务端下只开放原40个，这是兼容保护。
2. 前端准备好后，由你手动将palm-api-cover-expansion-python310.zip更新到原palm-api，继续使用原Python3.10、依赖、配置和环境变量。后端仅扩展图标白名单与能力响应，不需要更新桥接、支付、定时任务、数据库集合或索引。
3. 确认GET /api/mp/auth/me返回capabilities.item_cover_icons=true以及整数item_cover_icons_version=2。重新进入新增物品，即可看到90个图标；没有版本2时新版前端只允许原40个，不会让用户选择一个尚不能保存的新图标。
4. 用测试账号在安卓、苹果真机扫码确认：搜“移动电源”、选择键盘等新图标、取消及恢复草稿、新增和编辑保存、列表／详情／档案／回收站／收纳／收藏小报与导出。真机部分仍需你确认。
5. 验收后由你手动上传、提审、发布前端。本轮没有自动部署、上传、发布或改动真实账户数据。
6. 如需回退界面，优先回退前端并保留新版后端白名单。已有新图标物品出现后，不应将后端白名单缩回40个，否则这些编号的后续编辑会被旧后端拒绝。不删除或迁移任何真实物品。

## 更新包与可编辑源码

catpaw-miniprogram.zip是完整可导入前端项目。为保持插画清晰度与主包余量，交付构建使用微信开发者工具自带的Terser压缩代码，以及无图片重编码的样式／JSON排版压缩；不混淆属性名，保留函数名和类名，不增加小程序运行时依赖。包内文件合计{build['bytes']:,}字节，低于2MiB源文件体积自检上限；最终上传大小以开发者工具显示为准。

catpaw-editable-source-and-icons.zip用于开发备份，保留未压缩源码、90个可编辑SVG及图标生成／构建脚本。未压缩源码文件合计{build['sourceBytes']:,}字节，不要把整个备份包当成主包直接上传，也不要与构建目录混合。当前工作区中的源码仍可直接编辑，旧图片分辨率没有降低。

## 验收记录

源码与交付构建模块各{tests['frontend']}项前端检查通过；封面、本地数据库、CloudBase隔离文档、照片、月报、版本冲突和基础后端共{backend_count}项回归通过。所有50个新编号均验证保存、修改与幂等重试，旧客户端省略封面字段时保留原编号。

源码和构建各36项真实模板布局检查通过，覆盖320／390／430／768宽度、放大字号、短屏、旧版兼容及列表详情；两版布局一致，36组截图只有一张的单个边缘像素存在轻微抗锯齿差异。{manifest['wechat_compile_checks']}项微信模板／样式编译、{manifest['native_checks']}项最终构建代码的离线微信模拟器交互检查通过。模拟器截图使用容量未满的示例账号，不连接生产接口。

资源检查确认90个PNG均为128×128透明图片，新图标无触边裁切；原40个及其他既有图片与上一包逐字节一致。源码／构建对应关系、ZIP完整性、Python3.10语法及SHA-256均已检查。各zip.sha256文件和upload-manifest.json提供校验值；详细记录见本目录JSON与日志。

售价、支付、会员期限、签到奖励和物品容量规则均保持不变，无需新增环境变量、索引或数据库迁移。
'''
(out / '中文更新步骤.md').write_text(manual, encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
