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
out = deploy / 'beauty-icons-20261018'
out.mkdir(parents=True, exist_ok=True)
proof = root / 'docs/images/beauty-icons-20261018'
project = root / 'miniprogram'
built = root.parent / 'test-results/beauty-icons-project'
build = json.loads((root.parent / 'test-results/beauty-icons-build.json').read_text(encoding='utf-8'))
results = {name: json.loads((proof / name).read_text(encoding='utf-8-sig')) for name in ('layout-results.json', 'compile-results.json', 'native-results.json', 'asset-results.json', 'build-visual-parity.json')}
assert all(r['passed'] for r in results.values())
assert json.loads((proof / 'packed/layout-results.json').read_text(encoding='utf-8'))['passed']


def log(name):
    raw = (root.parent / 'test-results' / name).read_bytes()
    return raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')


tests = {}
for name in ('frontend', 'packed'):
    text = log('beauty-icons-' + name + '.log')
    count = int(re.search(r'# tests (\d+)', text).group(1))
    assert f'# pass {count}' in text and '# fail 0' in text
    tests[name] = count
backend_log = log('beauty-icons-backend.log')
backend_count = int(re.search(r'Ran (\d+) tests', backend_log).group(1))
assert backend_log.rstrip().endswith('OK')
catalogue = json.loads((root / 'branding/beauty-icons-20261018/catalogue.json').read_text(encoding='utf-8'))
new_art = {'assets/item-covers/' + row['key'] + '.png' for row in catalogue if row.get('version') == 3}
assert len(catalogue) == 100 and len(new_art) == 10
names = {r['name'] for r in build['files']}
assert not any('qa-fixture' in n or 'api-original' in n or 'project.private' in n for n in names)
with zipfile.ZipFile(deploy / 'cover-expansion-20261018/catpaw-editable-source-and-icons.zip') as prior:
    old_names = {n.removeprefix('miniprogram/') for n in prior.namelist() if n.startswith('miniprogram/')}
    changed = sorted(n for n in names if n not in old_names or (project / n).read_bytes() != prior.read('miniprogram/' + n))
    assert not old_names - names
    assert set(changed) == new_art | {'utils/item-cover-catalogue.js', 'utils/item-covers.js', 'utils/cover-picker.js'}
    for name in old_names:
        if name.endswith('.png'):
            assert prior.read('miniprogram/' + name) == (project / name).read_bytes(), name



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
    for folder in ('item-covers-20261011', 'item-covers-20261018', 'beauty-icons-20261018'):
        for p in sorted((root / 'branding' / folder).glob('*')):
            if p.suffix in ('.svg', '.json'):
                archive.write(p, 'branding/' + folder + '/' + p.name)
    for name in ('prepare-beauty-icons.cjs', 'build-beauty-icons.cjs', 'extract-wechat-terser.py'):
        archive.write(root / 'tools' / name, 'tools/' + name)
editable_info = finish_bundle(editable)

sources = [(p, 'palm/' + p.name) for p in sorted((root / 'backend/palm').glob('*.py'))]
sources += [(root / 'backend/cloudbase_probe' / n, 'cloudbase_probe/' + n) for n in ('__init__.py', 'client.py')]
sources += [(deploy / 'api' / n, n) for n in ('app.py', 'scf_bootstrap', 'requirements.txt')]
baseline = deploy / 'cover-expansion-20261018/palm-api-cover-expansion-python310.zip'
with zipfile.ZipFile(baseline) as archive:
    api_changed = [n for p, n in sources if p.read_bytes().replace(b'\r\n', b'\n') != archive.read(n).replace(b'\r\n', b'\n')]
assert api_changed == ['palm/covers.py']
for p, name in sources:
    if name.endswith('.py'):
        ast.parse(p.read_text(encoding='utf-8'), feature_version=(3, 10))
spec = importlib.util.spec_from_file_location('builder', root / 'tools/prepare-purchases-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.OUTPUT = out
builder.RELEASE = out.name
api = builder.build('palm-api-beauty-icons-python310.zip', baseline, 'third_party/', sources)
with zipfile.ZipFile(out / api['file']) as archive:
    assert all(archive.read(n) == p.read_bytes().replace(b'\r\n', b'\n') for p, n in sources)
api_info = finish_bundle(out / api['file'])
manifest = {'release': out.name, 'deployed': False, 'real_data_modified': False, 'new_icons': 10, 'total_icons': 100,
    'new_png_bytes': results['asset-results.json']['newBytes'], 'existing_pngs_unchanged': True, 'catalogue_version': 3,
    'changed_frontend_sources': changed, 'changed_api_files': api_changed, 'frontend_tests': tests,
    'backend_tests': backend_count, 'layout_checks': 40, 'built_layout_checks': 40,
    'wechat_compile_checks': len(results['compile-results.json']['checks']), 'native_checks': len(results['native-results.json']['checks']),
    'runtime_build': {'source_bytes': build['sourceBytes'], 'bytes': build['bytes'], 'compiler': build['compiler'], 'properties_mangled': False, 'kept_function_and_class_names': True},
    'python310_syntax_verified': True, 'real_device_verified': False, 'bundles': [front_info, api_info, editable_info]}
(out / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
for name in results:
    shutil.copy2(proof / name, out / name)
shutil.copy2(proof / 'packed/layout-results.json', out / 'packed-layout-results.json')
for name in ('beauty-icons-frontend.log', 'beauty-icons-packed.log', 'beauty-icons-backend.log'):
    shutil.copy2(root.parent / 'test-results' / name, out / name)
shutil.copy2(root.parent / 'test-results/beauty-icons-build.json', out / 'build-manifest.json')
shots = out / '截图'
shots.mkdir(exist_ok=True)
for name in ('picker-native.png', 'editor-native.png', 'version1-native.png', 'version2-native.png', 'picker-390.png', 'picker-large-320.png', 'detail-390.png', 'list-390.png'):
    shutil.copy2(proof / name, shots / name)
shutil.copy2(root / 'branding/beauty-icons-20261018/10个化妆护肤图标总览.png', out / '10个化妆护肤图标总览.png')
manual = f'''# 化妆护肤图标补齐为100个

## 这次增加什么

新增口红、粉底液、粉饼／气垫、眼影盘、睫毛膏、精华液、面霜、面膜、卸妆水、化妆刷，共10个。使用膏体、方瓶、圆盒、彩妆盘、刷头、滴管瓶、圆罐与袋装等不同轮廓，避免只换颜色重复画瓶子。完整外观见“10个化妆护肤图标总览.png”。

全部归入现有“日用”图标组，选择封面仍不改变物品分类。搜索支持“唇膏、气垫、眼影、面膜贴、卸妆液、刷具”等别名；“气垫”也可能匹配原有气垫梳，可结合名称选择。原90个编号、名称、搜索别名及PNG字节保持不变，其他已有图片也没有改动。新增PNG共{manifest['new_png_bytes']:,}字节，全部128×128透明底，低于20KiB目标；SVG源文件保存在可编辑源码包中。

## 更新顺序

1. 保留当前前后端备份。把catpaw-miniprogram.zip解压到新目录，导入微信开发者工具，先准备并检查前端，暂不发布。不要把说明、截图、SVG和可编辑源码备份混入该目录。
2. 前端准备好后，由你手动将palm-api-beauty-icons-python310.zip更新到原palm-api，继续使用原Python3.10及原配置。本轮相对上一轮后端只修改palm/covers.py，扩展白名单及目录版本常量；依赖和接口地址不变。
3. 确认GET /api/mp/auth/me的capabilities.item_cover_icons为true、item_cover_icons_version为整数3。重新进入新增物品即可使用100个图标；版本1或缺失版本时仍为40个，版本2为90个。新版前端不会允许选择当前后端不支持的新编号。
4. 在安卓、苹果真机用测试账号扫码确认：搜索“唇膏”“面膜贴”，选择、取消、草稿恢复、新增和编辑保存，查看列表／详情／档案／回收站／收纳／小报与导出。真机部分仍需你确认。
5. 验收后再由你手动上传、提审、发布前端。本轮没有自动部署、发布或修改真实账户数据；不新增数据库集合、索引、环境变量，也无需更新桥接或支付任务。
6. 如需回退界面，优先回退前端并保留新版后端白名单。新编号已被保存后，不要将后端白名单缩回90或40个，以免对应物品后续编辑被旧后端拒绝。不删除或迁移任何真实物品。

## 更新包与源码

catpaw-miniprogram.zip是完整可导入前端项目。延续上一轮构建压缩，不混淆属性名，保留函数名及类名。图标目录改用紧凑数据表生成图片路径；构建目录只含实际打包文件，因此同时去掉了指向不存在素材的历史打包规则，保留SVG、私有项目配置及node_modules的排除规则。没有降低任何已有图片的分辨率或清晰度。

构建包文件合计{build['bytes']:,}字节，通过2MiB源文件体积自检；最终上传大小以开发者工具显示为准。可编辑源码文件合计{build['sourceBytes']:,}字节，源码备份不应直接当主包上传。

catpaw-editable-source-and-icons.zip保留未压缩源码、100个SVG、完整目录和本轮生成／构建脚本。日常开发继续编辑工作区源码；重新生成本轮图标请使用prepare-beauty-icons.cjs，再构建交付目录。不要用旧轮次素材脚本覆盖当前100个图标目录。

## 验收

源码与最终构建模块各{tests['frontend']}项前端检查通过，相关后端{backend_count}项回归通过，覆盖SQLite、CloudBase隔离文档、所有10个新编号保存／修改／幂等、历史封面保留、回收站恢复、照片、月报和版本冲突。新增图标继续沿用草稿、确认替换照片、取消和提交保护。

源码及构建各40项真实模板布局检查通过，覆盖320／390／430／768宽度、大字号、短屏和40／90／100个目录；两版截图与布局对照通过。{manifest['wechat_compile_checks']}项微信模板／样式编译和{manifest['native_checks']}项最终构建的离线微信交互检查通过。实际截图在“截图”目录，*-native.png来自微信模拟器，其余来自真实WXML／WXSS的浏览器检查，均为示例资料。

资源检查确认100个PNG尺寸及透明背景正确，新10个无触边裁切；原90个图片和所有其他既有PNG与上一包逐字节一致。前后端100个编号一致，ZIP完整性、源码／构建哈希对应及Python3.10语法已检查。各zip.sha256及upload-manifest.json提供校验值。

物品容量、会员、价格、支付、签到奖励及真实数据均未改变。'''

(out / '中文更新步骤.md').write_text(manual, encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
