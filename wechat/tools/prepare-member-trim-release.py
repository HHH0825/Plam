"""Build verified manual-upload member-feature trim packages, entirely offline."""
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
output = deploy / 'member-trim-20261017'
evidence = root / 'docs/images/member-trim-20261017'
output.mkdir(parents=True, exist_ok=True)
def test_log(name):
    data = (root.parent / 'test-results' / name).read_bytes()
    return data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
python_log, js_log = test_log('member-trim-python.log'), test_log('member-trim-js.log')
python_tests = int(re.search(r'Ran (\d+) tests', python_log).group(1))
js_tests = int(re.search(r'tests (\d+)', js_log).group(1))
assert python_log.rstrip().endswith('OK') and 'fail 0' in js_log and f'pass {js_tests}' in js_log
spec = importlib.util.spec_from_file_location('builder', root / 'tools/prepare-purchases-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.OUTPUT, builder.RELEASE = output, 'member-trim-20261017'
baseline = deploy / 'book-comic-20261017/palm-api-book-comic-python310.zip'
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
api = builder.build('palm-api-member-trim-python310.zip', baseline, 'third_party/', sources)
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
with zipfile.ZipFile(deploy / 'book-comic-20261017/catpaw-miniprogram.zip') as before:
    prior_size = sum(i.file_size for i in before.infolist())
digest = hashlib.sha256(front_path.read_bytes()).hexdigest()
(output / 'catpaw-miniprogram.zip.sha256').write_text(f'{digest}  {front_path.name}\n', encoding='utf-8')
front = {'file': front_path.name, 'bytes': front_path.stat().st_size, 'sha256': digest, 'source_files': len(front_sources), 'uncompressed_bytes': size, 'net_added_bytes': size - prior_size}
manifest = {'release': builder.RELEASE, 'deployed': False, 'cloud_writes': 0, 'real_payments': 0,
            'bundles': [api, front, bridge], 'changed_api_files': changed_api, 'create_collections': [], 'add_indexes': [],
            'python310_syntax_verified': True, 'linux_runtime_executed': False, 'dependency_versions_verified': versions,
            'real_device_verified': False, 'breaking_removed_member_routes': True, 'python_tests': python_tests, 'frontend_tests': js_tests}
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
for name in ('books-native.png', 'entries-native.png', 'budget-native.png',
             'retired-analysis-native.png', 'statistics-cash-native.png',
             'statistics-items-native.png', 'statistics-returned-native.png',
             'detail-native.png', 'membership-native.png', 'comparison-native.png',
             'me-native.png', 'entries-long-320-large.png', 'statistics-cash-320-large.png'):
    shutil.copy2(evidence / name, shots / name)
for name in ('member-trim-js.log', 'member-trim-python.log'):
    shutil.copy2(root.parent / 'test-results' / name, output / name)

manual = '''# 会员功能精简与统计布局：中文更新步骤

本次需要一起更新小程序前端与 palm-api。代码包已在本地准备好，没有部署、付款或修改真实会员数据。

## 本次变化

- 我的账本保留“账本／流水整理”两栏，删除标签管理、设置标签及标签展示；账单详情入口改为“整理账本”。
- 移除自定义分析和分析方案，“会员工具”现为3项：我的账本、月度预算、手账外观。权益对比和服务端权益同步更新。
- 全部账本筛选采用细线折角箭头，长名称省略，打开选择器仍可看完整名称。
- 统计顶部先显示“收支／物品”，收支下方再显示“账本选择／我的账本”；物品页没有账本导航或其错误提示。切回收支保留有效账本选择，切换账号清除旧账号状态。
- 账单详情“支出 · 手动记账”等来源文字去掉胶囊底色。记账页三个入口保持原布局。
- 基础统计、图表、收支日历、预算、账本排序和流水移动继续保留。历史标签、分析方案数据不删除，也不再读取展示。

## 先准备前端，再安排后端与前端发布

**这是一次存在旧客户端兼容影响的更新。** 标签和自定义分析专用接口直接删除，不提供空读取兼容。旧版账本页面依赖标签接口，更新后端后，旧版可能无法正常打开账本；必须同步更新小程序。旧自定义分析链接在新版显示下线提示和返回入口。

1. 保存当前线上前端工程和 palm-api 代码包，以便成对回退。备份历史数据，勿清空会员文档集合。
2. 将 catpaw-miniprogram.zip 解压到新文件夹，用微信开发者工具导入包含 app.json、project.config.json 的目录，保持原 AppID。先完成编译和预览验收；不要先更新线上后端、再长期等待前端准备。
3. 准备体验／提审版本，安排紧凑的后端更新与前端发布窗口。正式前端应先准备并验收，再安排后端更新。若审核尚未通过，不建议提前移除线上旧接口。
4. 到 CloudBase 现有 palm-api，按原方式上传 palm-api-member-trim-python310.zip，仅替换代码。保留运行环境、入口、环境变量、超时、网络和权限。不用新建集合或索引，不用修改售价、支付开关、商品ID、会员期限或 palm-pay-notify。
5. 当前项目使用 cloud_http_function，不用上传 palm-api-bridge-optional-node20.zip。仅仍使用旧 cloud_function 桥接方式的工程，需要在同一窗口同步更新原桥接函数，并保持原配置。
6. 核对新前端与新 API 组合后，按你的安排发布小程序。通知使用旧版的测试人员关闭并重新打开小程序，确保加载新版。已安装旧客户端不能仅靠这次接口删除自动变成新版，因此需尽量缩短版本不一致的时间。

## 手机验收清单

- “我的”只出现3项会员工具，免费版／会员权益对比没有自定义分析。
- 我的账本只有两栏；新建、编辑、拖动排序、归档／恢复及流水移动正常，退款继续跟随原支出账本。
- 流水整理的长账本名称不挤坏箭头，选择列表展示完整名称。
- 收支筛选一个账本后切物品，物品没有账本导航，统计结果不随该筛选改变；再切回收支，原有效账本仍选中。账号切换不显示前账号账本。
- 读取失败时，收支显示原有重试提示；物品页不展示该组提示。删除所选账本后自动回到全部账本。
- 预算计算、草稿保存、基础图表、收支日历及账单详情正常；来源文字无背景。
- 安卓、苹果真机分别查看正常／放大字号、长名称与点击区域。此次电脑验收不能代替两端真机检查。

## 回退与校验

如需回退，恢复配套的上一版 palm-api 与小程序前端；只恢复旧前端仍会依赖已删接口。不要删除历史标签／方案文档，也不要手动修改支付订单或会员期限。

各包 SHA-256 见同名 .sha256 文件和 upload-manifest.json；截图在“验收截图”，测试结果在“验收记录.md”。这些材料无需上传到小程序。
'''
report = f'''# 验收记录

- 后端回归 {python_tests} 项、前端回归 {js_tests} 项通过。涵盖删除接口返回404、历史文档保留、权益清理、预算与退款、账本排序／移动、账户切换及原支付回归。
- 布局检查 {len(results['layout-results.json']['checks'])} 项通过：320／390／430／768宽度及320放大字号，含两栏、长名称、状态文字和物品页无导航／错误占位。
- 微信模板与样式编译 {len(results['compile-results.json']['checks'])} 项通过；隔离微信运行 {len(results['native-results.json']['checks'])} 项通过，截图来自模拟器，测试排序仅作用于离线内存。
- 前端 {len(front_sources)} 个运行文件与当前源文件逐一一致，解压合计 {size:,} 字节；比上一版变化 {size-prior_size:+,} 字节，小于2MiB。未打包QA夹具或私人配置。
- API运行源仅 palm/membership.py 相比上一版变化；Python3.10语法、固定依赖版本、启动脚本权限和ZIP完整性校验通过。可选桥接包同步移除退休接口白名单。
- 旧客户端依赖已移除接口，需配套更新。历史标签／分析方案文档保留但不读取展示。
- 未执行真实云函数／Linux运行验证，未进行安卓、苹果真机验收。没有部署、真实付款或真实数据写入。
'''
for filename, content in [('中文操作说明.md', manual), ('验收记录.md', report)]:
    (output / filename).write_text(content, encoding='utf-8')
for filename, content in [('member-trim-manual-20261017.md', manual), ('member-trim-acceptance-20261017.md', report)]:
    (root / 'docs' / filename).write_text(content, encoding='utf-8')
print(json.dumps({'output': str(output), 'frontend': front, 'api': {k: api[k] for k in ('file', 'bytes', 'sha256')}, 'native_checks': len(results['native-results.json']['checks'])}, ensure_ascii=False))
