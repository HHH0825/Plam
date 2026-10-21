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
output = deploy / 'compact-tools-20261017'
evidence = root / 'docs/images/compact-tools-20261017'
output.mkdir(parents=True, exist_ok=True)
def test_log(name):
    data = (root.parent / 'test-results' / name).read_bytes()
    return data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
python_log, js_log = test_log('compact-tools-python.log'), test_log('compact-tools-js.log')
python_tests = int(re.search(r'Ran (\d+) tests', python_log).group(1))
js_tests = int(re.search(r'tests (\d+)', js_log).group(1))
assert python_log.rstrip().endswith('OK') and 'fail 0' in js_log and f'pass {js_tests}' in js_log
spec = importlib.util.spec_from_file_location('builder', root / 'tools/prepare-purchases-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.OUTPUT, builder.RELEASE = output, 'compact-tools-20261017'
baseline = deploy / 'free-appearance-20261017/palm-api-free-appearance-python310.zip'
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
api = builder.build('palm-api-compact-tools-python310.zip', baseline, 'third_party/', sources)
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
    assert b'sticker-grid' not in archive.read('pages/member-tools/index.wxml')
    assert b'member-identity' in archive.read('pages/me/index.wxml')
    assert not any(n.startswith('assets/stickers/') and n!='assets/stickers/collector.png' for n in archive.namelist())
    assert not any('qa-fixture' in n or 'project.private' in n or '..' in Path(n).parts for n in archive.namelist())
    size = sum(i.file_size for i in archive.infolist())
    assert size < 2 * 1024 * 1024, size
with zipfile.ZipFile(deploy / 'free-appearance-20261017/catpaw-miniprogram.zip') as before:
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
for name in ('ledger-closed-native.png','ledger-open-native.png','ledger-filtered-native.png',
             'statistics-closed-native.png','statistics-open-native.png','statistics-items-native.png',
             'appearance-native.png','appearance-cash-native.png','appearance-collection-native.png',
             'me-free-native.png','me-active-native.png','me-expired-native.png','me-error-native.png',
             'me-unsupported-native.png','me-long-320-large.png','ledger-filtered-320-large.png'):
    shutil.copy2(evidence / name, shots / name)
for name in ('ledger-native.png','me-native.png'):
    shutil.copy2(root / 'docs/images/free-appearance-20261017' / name, shots / ('调整前-'+name))
for name in ('compact-tools-js.log','compact-tools-python.log'):
    shutil.copy2(root.parent / 'test-results' / name, output / name)

manual = '''# 工具折叠、会员入口与贴纸精简：中文更新步骤

本次需要更新小程序前端及 palm-api。没有自动部署、付款或修改真实账户数据。

## 更新后的操作

- 记账顶部显示“账本与预算”，首次默认收起。点整行或右侧加号可展开三个入口和预算卡，再点减号收起。
- 统计收支页显示“账本工具”，首次默认收起；物品页不显示这组内容。两个页面分别按账户记住展开状态，切换账户不会沿用另一人的选择。
- 折叠栏仍显示当前账本；非全部账本会突出显示。折叠不清空筛选、月份或预算。读取失败会注明，展开后使用原重试按钮，不会假装读成全部账本。
- 猫爪会员改到昵称下方的小型身份条；头像仍打开个人资料。身份条打开原会员页，已开通显示到期日，读取失败可单独重试。初创特惠标志仍按原活动时间显示，完整活动说明在会员页。
- 手账外观删除可选猫咪贴纸和小报底部附加贴纸及留白。配色、三个模板继续免费；模板自带猫咪插画保留，选择后仍需“应用外观”才保存。
- 历史贴纸文档不批量清理，读取时忽略。旧客户端提交的贴纸字段接受但忽略；新版只保存配色和模板。售价、支付、会员有效期及其他权限不变。

## 你需要手动操作

1. 保存当前前端工程及已部署的 palm-api 包，以便回退；不要清空数据库或会员文档。
2. 解压 catpaw-miniprogram.zip 到新文件夹，用微信开发者工具导入含 app.json 和 project.config.json 的目录，保持原 AppID。先编译和扫码预览新版，再安排后端更新及前端发布。
3. 腾讯 CloudBase 打开现有 palm-api，上传 palm-api-compact-tools-python310.zip，仅更新代码。保留原入口、运行环境、环境变量、超时、权限和网络配置；不要上传到 palm-pay-notify。
4. 不需要新增集合、索引或执行迁移，不改支付开关、商品ID、售价和会员期限。折叠偏好仅保存在用户手机本机。
5. 当前项目使用 cloud_http_function，不需要上传 palm-api-bridge-optional-node20.zip。只有旧 cloud_function 桥接工程才需同步更新原桥接函数，并保持原配置。
6. 配套新后端与新前端检查下列项目，确认后由你上传、提审并发布。已有用户关闭并重开小程序以加载新版。

若你跳过了前面标签／自定义分析删除的更新，本包也包含这些改动：旧账本页面依赖已删标签接口，应先准备、验收新版前端，再协调后端与前端发布，避免长时间版本不一致。

## 手机验收清单

- 记账、统计首次默认收起；分别展开后离开再返回，保持各自状态。收支切物品时工具整组消失，切回后原账本仍保留。
- 在非全部账本下收起，标题仍显示所选名称；长名称省略但不挤坏加减号。展开后选择列表可看完整名称。
- 切换账户，旧账户的账本、筛选提示和展开状态不能残留；存储不可用时本次页面仍能正常收放。
- 未开通／已开通／已到期的会员身份条位置正确；已开通日期按北京时间显示，头像与身份条打开不同的原有页面。
- 外观只剩配色与模板；原选过贴纸的账户也不出现附加贴纸和多余留白。三种模板在收支与收藏小报均能预览和导出。
- 安卓、苹果分别检查触摸、正常及放大字号；本次电脑模拟器不能代替真机验收。

## 校验与回退

各包SHA-256见同名 .sha256 文件及 upload-manifest.json；“验收截图”包含调整前和调整后截图，“验收记录.md”包含检查结果。这些材料无需打包上传。

需要回退时，恢复配套的上一版前端及API。未重新保存的历史贴纸字段仍保留；已经按新版保存的外观只含配色与模板，不会恢复已舍弃的贴纸选择。不要修改真实订单或会员期限。
'''
report = f'''# 验收记录

- 后端 {python_tests} 项回归通过，两种存储提供者覆盖历史贴纸读取不重写、旧字段忽略、配色模板保存、登录／版本／幂等保护及原支付预算回归。
- 前端 {js_tests} 项回归通过，覆盖独立页面偏好、稳定账户ID与服务环境隔离、存储失败、筛选提示、紧凑身份状态，以及旧贴纸无渲染或附加高度。
- 布局 {len(results['layout-results.json']['checks'])} 项通过，覆盖320／390／430／768及320放大字号、长昵称、长账本名、六种会员状态和收放布局。
- 微信模板与样式编译 {len(results['compile-results.json']['checks'])} 项通过；隔离微信运行 {len(results['native-results.json']['checks'])} 项通过，外观应用仅写模拟器隔离内存。
- 前端 {len(front_sources)} 个文件逐一匹配源文件，解压 {size:,} 字节，较上一版变化 {size-prior_size:+,} 字节；移除5张只供可选贴纸使用的图片，保留权益对比共用图片，未新增大图。
- API运行源只修改 palm/membership.py；Python3.10语法、固定依赖版本、Linux启动脚本权限及ZIP完整性已校验。
- 没有运行真实云函数／Linux部署环境，安卓和苹果真机仍需用户扫码确认；没有自动部署、真实付款或真实数据写入。
'''
for filename, content in [('中文操作说明.md',manual),('验收记录.md',report)]:
    (output / filename).write_text(content,encoding='utf-8')
for filename, content in [('compact-tools-manual-20261017.md',manual),('compact-tools-acceptance-20261017.md',report)]:
    (root / 'docs' / filename).write_text(content,encoding='utf-8')
print(json.dumps({'output':str(output),'frontend':front,'api':{k:api[k] for k in ('file','bytes','sha256')},'native_checks':len(results['native-results.json']['checks'])},ensure_ascii=False))
