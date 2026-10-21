"""Build verified manual-upload book-cover/order packages, entirely offline."""
import ast
import email
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
deploy = root / 'deploy/cloudbase'
output = deploy / 'book-comic-20261017'
evidence = root / 'docs/images/book-comic-20261017'
output.mkdir(parents=True, exist_ok=True)
def test_log(name):
    data = (root.parent / 'test-results' / name).read_bytes()
    return data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
python_log, js_log = test_log('book-comic-python.log'), test_log('book-comic-js.log')
python_tests = int(re.search(r'Ran (\d+) tests', python_log).group(1))
js_tests = int(re.search(r'tests (\d+)', js_log).group(1))
assert python_log.rstrip().endswith('OK') and 'fail 0' in js_log and f'pass {js_tests}' in js_log
spec = importlib.util.spec_from_file_location('builder', root / 'tools/prepare-purchases-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.OUTPUT, builder.RELEASE = output, 'book-comic-20261017'
baseline = deploy / 'membership-refine-20261016/palm-api-membership-refine-python310.zip'
sources = [(p, 'palm/' + p.name) for p in sorted((root / 'backend/palm').glob('*.py'))]
sources += [(root / 'backend/cloudbase_probe' / n, 'cloudbase_probe/' + n) for n in ('__init__.py', 'client.py')]
sources += [(deploy / 'api' / n, n) for n in ('app.py', 'scf_bootstrap', 'requirements.txt')]
for p, name in sources:
    if name.endswith('.py'):
        ast.parse(p.read_text(encoding='utf-8'), filename=name, feature_version=(3, 10))
with zipfile.ZipFile(baseline) as archive:
    versions = {}
    for name in archive.namelist():
        if name.startswith('third_party/') and name.endswith('.dist-info/METADATA'):
            metadata = email.message_from_bytes(archive.read(name))
            versions[metadata['Name'].lower().replace('_', '-')] = metadata['Version']
for line in (deploy / 'api/requirements.txt').read_text().splitlines():
    if line.strip() and not line.startswith('#'):
        name, version = line.split('==')
        assert versions[name.lower().replace('_', '-')] == version
api = builder.build('palm-api-book-comic-python310.zip', baseline, 'third_party/', sources)
with zipfile.ZipFile(baseline) as before, zipfile.ZipFile(output / api['file']) as after:
    changed_api = [name for _, name in sources if before.read(name).replace(b'\r\n', b'\n') != after.read(name)]
    assert changed_api == ['palm/membership.py'], changed_api
    for p, name in sources:
        assert after.read(name) == p.read_bytes().replace(b'\r\n', b'\n')

bridge_sources = [(deploy / 'bridge' / n, n) for n in ('index.js', 'package.json', 'package-lock.json')]
bridge = builder.build('palm-api-bridge-optional-node20.zip', deploy / 'palm-api-bridge-node20.zip', 'node_modules/', bridge_sources)
bridge['optional_for_legacy_transport'] = True
project = root / 'miniprogram'
config = json.loads((project / 'project.config.json').read_text(encoding='utf-8'))
def matches(name, rule):
    return (rule['type'] == 'suffix' and name.endswith(rule['value'])
            or rule['type'] == 'file' and name == rule['value']
            or rule['type'] == 'folder' and name.startswith(rule['value'] + '/'))
def ignored(name):
    return any(matches(name, r) for r in config['packOptions']['ignore']) and not any(matches(name, r) for r in config['packOptions'].get('include', []))
front_path = output / 'catpaw-miniprogram.zip'
front_sources = {p.relative_to(project).as_posix(): p for p in sorted(project.rglob('*'))
                 if p.is_file() and not ignored(p.relative_to(project).as_posix())
                 and not p.name.startswith('project.private')
                 and not set(p.parts).intersection({'node_modules', '.git', '__pycache__'})}
with zipfile.ZipFile(front_path, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, p in front_sources.items():
        archive.write(p, name)
with zipfile.ZipFile(front_path) as archive:
    assert archive.testzip() is None
    for name, p in front_sources.items():
        assert archive.read(name) == p.read_bytes()
    assert b'qaDrag' not in archive.read('pages/member-tools/index.js')
    assert not any('qa-fixture' in n or 'project.private' in n or '..' in Path(n).parts for n in archive.namelist())
    size = sum(i.file_size for i in archive.infolist())
    assert size < 2 * 1024 * 1024, size
with zipfile.ZipFile(deploy / 'membership-details-20261016/catpaw-miniprogram.zip') as before:
    prior_size = sum(i.file_size for i in before.infolist())
digest = hashlib.sha256(front_path.read_bytes()).hexdigest()
(output / 'catpaw-miniprogram.zip.sha256').write_text(f'{digest}  {front_path.name}\n', encoding='utf-8')
front = {'file': front_path.name, 'bytes': front_path.stat().st_size, 'sha256': digest, 'source_files': len(front_sources), 'uncompressed_bytes': size, 'net_added_bytes': size - prior_size}
manifest = {'release': builder.RELEASE, 'deployed': False, 'cloud_writes': 0, 'real_payments': 0,
            'bundles': [api, front, bridge], 'changed_api_files': changed_api, 'create_collections': [], 'add_indexes': [],
            'python310_syntax_verified': True, 'linux_runtime_executed': False, 'dependency_versions_verified': versions,
            'real_device_drag_verified': False, 'python_tests': python_tests, 'frontend_tests': js_tests}
(output / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

results = {}
for name in ('layout-results.json', 'compile-results.json', 'native-results.json'):
    results[name] = json.loads((evidence / name).read_text(encoding='utf-8-sig'))
    assert results[name]['passed']
    shutil.copy2(evidence / name, output / name)
audit = json.loads((evidence / 'package-audit.json').read_text(encoding='utf-8'))
assert audit['includedRawBytes'] < 2 * 1024 * 1024
shutil.copy2(evidence / 'package-audit.json', output / 'package-audit.json')
shots = output / '验收截图'
shots.mkdir(exist_ok=True)
for name in ('comic-covers.png', 'books-390.png', 'books-sort-390.png', 'books-sort-320-large.png',
             'editor-travel-390.png', 'books-native.png', 'dragging-native.png', 'saved-native.png', 'book-cover-1-native.png', 'covers-2x.png', 'covers-3x.png'):
    shutil.copy2(evidence / name, shots / name)
art = output / '高清矢量源图'
art.mkdir(exist_ok=True)
for p in (root / 'branding/book-comic-20261017').glob('*.svg'):
    shutil.copy2(p, art / p.name)
for name in ('book-comic-js.log', 'book-comic-python.log'):
    shutil.copy2(root.parent / 'test-results' / name, output / name)

manual = '''# 漫画账本封面与拖动排序：更新操作

本次需要更新 palm-api 与小程序前端，顺序为先后端、后前端。没有自动上传或改动真实数据。

## 已完成

- 日常、旅行、居家、兴趣四张漫画封面，沿用原封面标识，旧账本自动对应新图。
- 账本贴纸、更多设置、手填排序数字已移除；手账外观里的小报贴纸仍然保留。
- 新建与编辑直接点选两列封面，下方“预览”即时变化，保存才写入。
- “正在使用”左边新增排序按钮。进入后按住右侧手柄上下拖动，也可点上移／下移；取消不保存，完成才整组保存。
- 日常账本可以移动，仍不能删除或归档。新建及恢复归档账本默认追加到最后；记账、统计等账本选择器采用保存后的顺序。
- 遇到列表冲突，草稿保留，点“重新核对”，检查新增／删除账本后再点完成。结果待确认时锁定拖动，点“核对并重试”，不要重新乱序提交。

## 你需要操作

1. 备份当前小程序工程，并保存目前已部署的 palm-api 代码包，以便需要时恢复。
2. 腾讯 CloudBase 打开现有 palm-api，按原来的代码包上传方式上传 palm-api-book-comic-python310.zip。仅更新代码，保留原环境变量、运行环境、超时、网络和权限配置。不要把这个包上传到 palm-pay-notify。
3. 不用新建集合、索引或改数据权限。首次新建／排序／归档操作会在现有 palm_member_documents 内自动保存该账户的顺序文档，历史账目不会迁移或删除。
4. 当前工程使用 cloud_http_function，**不用上传** palm-api-bridge-optional-node20.zip。此包仅供仍在使用旧 cloud_function 桥接方式的工程；这类工程才需要同步更新原桥接函数，保留其配置。
5. catpaw-miniprogram.zip 解压到新的文件夹，在微信开发者工具导入含 app.json 与 project.config.json 的目录，使用原 AppID。编译后先扫码预览或上传体验版。
6. 用自己的会员账号检查四种封面；新建账本应在最后。点排序按钮，将日常账本拖到其他位置，先取消一次确认恢复；再拖动并完成，重开页面及记账／统计选择器核对顺序。选择器固定的“全部账本”仍在最前。
7. 安卓、苹果分别确认手指拖动、页面边缘滚动、名称输入及弹层键盘避让。电脑模拟器验收不能代替两端真机触摸检查。
8. 确认后按你的发布安排提审、发布。售价、支付开关、商品ID、会员期限和通知函数均不用修改。

## 部署过渡与回退

- 新前端遇到旧后端会提示更新云函数，排序不会假装保存成功；应先完成第2步再发前端。
- 旧前端继续兼容新后端。已有账户在第一次保存顺序前沿用原顺序；历史贴纸和排序数字字段保留兼容，新界面不再展示它们。
- 如需回退，优先恢复旧前端并保留新后端；如果后端也回退到更早版本，它仍固定把日常账本放首位，暂时不会显示新的拖动顺序，但不会删除账本或流水。不要手动清空顺序或会员文档。

代码包校验值见各自的 .sha256 文件与 upload-manifest.json。验收截图和可编辑矢量源图分别放在同名文件夹，源图无需上传到小程序。
'''
(output / '中文操作说明.md').write_text(manual, encoding='utf-8')
report = f'''# 验收记录

- 后端回归{python_tests}项、前端回归{js_tests}项通过；覆盖两种存储提供者、并发排序、版本冲突、重复提交、事务回滚及原支付回归。
- 布局与封面检查{len(results['layout-results.json']['checks'])}项通过：320／390／430／768宽度、320放大字号，以及2倍／3倍像素密度封面截图。
- 微信模板和样式编译{len(results['compile-results.json']['checks'])}项通过；离线微信运行{len(results['native-results.json']['checks'])}项通过，使用真实页面卡片测量及隔离数据，排序保存仅作用于模拟器内存。
- 四张封面192×252，合计{results['layout-results.json']['assetBytes']:,}字节；可编辑矢量源图不打包。
- 前端包解压文件合计{size:,}字节，较上一版净增{size-prior_size:,}字节，小于2MiB；{len(front_sources)}个运行文件与当前源码逐一一致。
- API包仅membership.py运行源发生变化；Python3.10语法、固定依赖版本、Linux启动脚本权限及ZIP完整性已校验。
- 没有运行真实云函数／Linux环境，也没有替代安卓、苹果真机的触摸与键盘验收。真机边缘滚动及触摸体验需由用户扫码确认。
- 无真实数据写入、真实付款或自动部署。
'''
(output / '验收记录.md').write_text(report, encoding='utf-8')
for filename, content in [('book-comic-manual-20261017.md', manual), ('book-comic-acceptance-20261017.md', report)]:
    (root / 'docs' / filename).write_text(content, encoding='utf-8')
print(json.dumps({'output': str(output), 'frontend': front, 'api': {k: api[k] for k in ('file', 'bytes', 'sha256')}, 'native_checks': len(results['native-results.json']['checks'])}, ensure_ascii=False))
