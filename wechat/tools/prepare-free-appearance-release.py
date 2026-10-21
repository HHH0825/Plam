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
output = deploy / 'free-appearance-20261017'
evidence = root / 'docs/images/free-appearance-20261017'
output.mkdir(parents=True, exist_ok=True)
def test_log(name):
    data = (root.parent / 'test-results' / name).read_bytes()
    return data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
python_log, js_log = test_log('free-appearance-python.log'), test_log('free-appearance-js.log')
python_tests = int(re.search(r'Ran (\d+) tests', python_log).group(1))
js_tests = int(re.search(r'tests (\d+)', js_log).group(1))
assert python_log.rstrip().endswith('OK') and 'fail 0' in js_log and f'pass {js_tests}' in js_log
spec = importlib.util.spec_from_file_location('builder', root / 'tools/prepare-purchases-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.OUTPUT, builder.RELEASE = output, 'free-appearance-20261017'
baseline = deploy / 'member-trim-20261017/palm-api-member-trim-python310.zip'
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
api = builder.build('palm-api-free-appearance-python310.zip', baseline, 'third_party/', sources)
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
with zipfile.ZipFile(deploy / 'member-trim-20261017/catpaw-miniprogram.zip') as before:
    prior_size = sum(i.file_size for i in before.infolist())
digest = hashlib.sha256(front_path.read_bytes()).hexdigest()
(output / 'catpaw-miniprogram.zip.sha256').write_text(f'{digest}  {front_path.name}\n', encoding='utf-8')
front = {'file': front_path.name, 'bytes': front_path.stat().st_size, 'sha256': digest, 'source_files': len(front_sources), 'uncompressed_bytes': size, 'net_added_bytes': size - prior_size}
manifest = {'release': builder.RELEASE, 'deployed': False, 'cloud_writes': 0, 'real_payments': 0,
            'bundles': [api, front, bridge], 'changed_api_files': changed_api, 'create_collections': [], 'add_indexes': [],
            'python310_syntax_verified': True, 'linux_runtime_executed': False, 'dependency_versions_verified': versions,
            'real_device_verified': False, 'appearance_free_for_logged_in_accounts': True, 'python_tests': python_tests, 'frontend_tests': js_tests}
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
for name in ('ledger-native.png', 'statistics-cash-native.png', 'statistics-items-native.png',
             'budget-sheet-native.png', 'appearance-free-native.png', 'appearance-applied-native.png',
             'appearance-cash-native.png', 'appearance-collection-native.png', 'me-native.png', 'me-settings-native.png',
             'membership-native.png', 'comparison-native.png', 'ledger-320-large.png',
             'ledger-long-320-large.png', 'ledger-over-390.png', 'ledger-error-390.png'):
    shutil.copy2(evidence / name, shots / name)
for name in ('free-appearance-js.log', 'free-appearance-python.log'):
    shutil.copy2(root.parent / 'test-results' / name, output / name)

manual = '''# 整合工具条、预算输入与免费手账外观：更新说明

需要一起更新小程序前端和 palm-api。没有自动部署、付款或修改真实账户数据。

## 本次调整

- 记账三个入口、统计收支两个入口改为浅暖色整合工具条，账本选择使用细线折角箭头。物品统计仍隐藏账本工具条。
- 记账工具条下新增整行可点击预算卡：未设置、剩余、超支、读取中和读取失败分别显示。读取失败可点击重试，成功状态打开当前月份和当前账本的预算页面；免费账户可预览，编辑仍需会员。
- 预算总额说明固定放在输入框下方，标签与输入分开；总额及分类输入对齐，弹层使用单一键盘避让方式。修改仍是草稿，保存后才生效。
- 手账外观改为所有登录用户免费。入口位于“我的”底部，与个人设置同组、排在其上方；会员工具变为2项：我的账本、月度预算。
- 配色、小报模板和猫咪贴纸全部免费，已保存选择继续生效，不再因会员到期、撤销赠送或退款恢复默认。点击“应用外观”才保存，恢复默认也需应用。
- 免费／会员对比同步修改，会员专属权益移除外观。售价、支付、会员期限、预算及账本编辑权限不变。

## 手动更新步骤

1. 保存当前小程序工程及正在部署的 palm-api 代码包，以便需要时成对回退。不要清空任何历史会员或外观文档。
2. 解压 catpaw-miniprogram.zip 到新文件夹，在微信开发者工具导入包含 app.json、project.config.json 的目录，使用原 AppID。先编译、预览和验收新前端，再安排后端更新与前端发布。
3. CloudBase 打开现有 palm-api，上传 palm-api-free-appearance-python310.zip，仅更新代码，保持原入口、运行环境、环境变量、超时、权限和网络配置。不要上传到 palm-pay-notify。
4. 不用新建数据库集合、索引或运行迁移。保留原售价、商品ID、支付开关和会员数据。
5. 当前项目使用 cloud_http_function，不需上传 palm-api-bridge-optional-node20.zip。该包仅供旧 cloud_function 桥接工程；这类工程需同步更新原桥接函数并保留配置。
6. 用配套新前端和新后端扫码检查下面的清单，再按你的安排上传、提审和发布。此次不会替你发布。

本包包含前一轮标签／自定义分析移除。如果你尚未部署前一轮更新，旧版账本页面依赖已删除标签接口，必须同时更新前端；先准备并验收新前端，安排紧凑的后端与前端发布窗口。旧用户关闭并重新打开小程序以加载新版，避免长时间版本不一致。

## 手机验收

- 记账三项、统计收支两项工具入口整齐，账本长名称不挤坏箭头；物品页没有账本工具条。
- 预算卡未设置时显示“去设置”，已设置显示剩余／超支及总额、进度；切换月份和账本后不显示旧范围额度。
- 预算总额、分类输入聚焦前后文字居中，键盘收放不重复上推；可滚动至下方分类。取消保留原云端额度，保存才更改。
- “我的”会员工具为2项，个人设置上方出现手账外观；免费用户可应用全部配色、模板和贴纸，不跳转购买页。
- 旧保存外观仍在；会员到期后外观不恢复默认。切换账号不能看到前账号外观或未应用草稿。
- 外观三个模块预览与实际页面、小报导出一致；恢复默认、离开未应用提示及读取失败重试正常。
- 安卓和苹果分别检查键盘、正常及放大字号。电脑模拟器验收不能代替真机确认。

## 校验与回退

各包SHA-256在同名 .sha256 文件及 upload-manifest.json，截图在“验收截图”，检查结果在“验收记录.md”。验收材料不需打包上传。

如需回退，恢复配套的上一版前端与API。旧API会恢复会员外观限制，但已保存的外观文档不会因此删除。不要手动修改订单、会员期限或删除外观文档。
'''
report = f'''# 验收记录

- 后端回归 {python_tests} 项通过：两种存储提供者、免费外观保存／重复请求／版本冲突、登录与账户隔离、会员到期仍生效及原支付、预算回归。
- 前端回归 {js_tests} 项通过：免费外观独立读取／应用、旧响应保护、账户隔离、键盘单次避让、预算状态和当前范围跳转。
- 布局检查 {len(results['layout-results.json']['checks'])} 项通过：320／390／430／768及320放大字号，含长名称、预算五种状态、弹层输入与免费外观。
- 微信模板与样式编译 {len(results['compile-results.json']['checks'])} 项通过；隔离微信运行 {len(results['native-results.json']['checks'])} 项通过。外观应用及排序只写模拟器隔离内存，没有连接业务云端。
- 前端 {len(front_sources)} 个文件逐一匹配源码；解压 {size:,} 字节，比上一版变化 {size-prior_size:+,} 字节，小于2MiB。没有新增大图片。
- API运行源仅 palm/membership.py 相比上一版变化；Python3.10语法、固定依赖版本、启动脚本权限及ZIP完整性校验通过。
- 未运行真实云函数／Linux环境；安卓和苹果真机键盘、触摸与放大字号仍由用户扫码验收。没有自动部署、真实付款或真实数据写入。
'''
for filename, content in [('中文操作说明.md', manual), ('验收记录.md', report)]:
    (output / filename).write_text(content, encoding='utf-8')
for filename, content in [('free-appearance-manual-20261017.md', manual), ('free-appearance-acceptance-20261017.md', report)]:
    (root / 'docs' / filename).write_text(content, encoding='utf-8')
print(json.dumps({'output': str(output), 'frontend': front, 'api': {k: api[k] for k in ('file', 'bytes', 'sha256')}, 'native_checks': len(results['native-results.json']['checks'])}, ensure_ascii=False))
