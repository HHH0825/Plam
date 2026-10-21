from pathlib import Path
import ast, hashlib, importlib.util, json, shutil, zipfile

root = Path(__file__).resolve().parents[1]
deploy = root / 'deploy/cloudbase'
out = deploy / 'income-categories-20261018'
out.mkdir(parents=True, exist_ok=True)
proof = root / 'docs/images/income-categories-20261018'
for name in ('layout-results.json', 'compile-results.json'):
    assert json.loads((proof / name).read_text(encoding='utf-8-sig'))['passed']

def log(name):
    raw = (root.parent / 'test-results' / name).read_bytes()
    return raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')

js = log('income-categories-frontend.log')
py = log('income-categories-backend.log')
assert 'pass 419' in js and 'fail 0' in js
assert 'Ran 34 tests' in py and py.rstrip().endswith('OK')
prior = deploy / 'save-paper-20261018/catpaw-miniprogram.zip'
front = out / 'catpaw-miniprogram.zip'
with zipfile.ZipFile(prior) as old, zipfile.ZipFile(front, 'w', zipfile.ZIP_DEFLATED) as new:
    for name in old.namelist():
        content = (root / 'miniprogram' / name).read_bytes()
        assert name == 'utils/ledger.js' or content == old.read(name), name
        new.writestr(name, content)
with zipfile.ZipFile(front) as archive:
    assert archive.testzip() is None
    size = sum(i.file_size for i in archive.infolist())
    assert size < 2 * 1024 * 1024
    assert all(archive.read(n) == (root / 'miniprogram' / n).read_bytes() for n in archive.namelist())
digest = hashlib.sha256(front.read_bytes()).hexdigest()
front.with_suffix('.zip.sha256').write_text(digest + '  ' + front.name + '\n', encoding='utf-8')
sources = [(p, 'palm/' + p.name) for p in sorted((root / 'backend/palm').glob('*.py'))]
sources += [(root / 'backend/cloudbase_probe' / n, 'cloudbase_probe/' + n) for n in ('__init__.py', 'client.py')]
sources += [(deploy / 'api' / n, n) for n in ('app.py', 'scf_bootstrap', 'requirements.txt')]
baseline = deploy / 'growth-20261018/palm-api-growth-python310.zip'
with zipfile.ZipFile(baseline) as archive:
    changed = [n for p, n in sources if p.read_bytes().replace(b'\r\n', b'\n') != archive.read(n).replace(b'\r\n', b'\n')]
    assert changed == ['palm/ledger.py'], changed
for p, name in sources:
    if name.endswith('.py'):
        ast.parse(p.read_text(encoding='utf-8'), feature_version=(3, 10))
spec = importlib.util.spec_from_file_location('builder', root / 'tools/prepare-purchases-release.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.OUTPUT = out
builder.RELEASE = out.name
api = builder.build('palm-api-income-categories-python310.zip', baseline, 'third_party/', sources)
with zipfile.ZipFile(out / api['file']) as archive:
    assert all(archive.read(n) == p.read_bytes().replace(b'\r\n', b'\n') for p, n in sources)
manifest = {'release': out.name, 'changed_frontend_files': ['utils/ledger.js'], 'changed_api_files': changed,
    'frontend_tests': 419, 'cash_ledger_backend_tests': 34, 'layout_checks': 24, 'wechat_compile_checks': 2,
    'python310_syntax_verified': True, 'deployed': False, 'real_data_modified': False,
    'bundles': [{'file': front.name, 'sha256': digest, 'bytes': front.stat().st_size, 'uncompressed_bytes': size},
                {'file': api['file'], 'sha256': api['sha256'], 'bytes': api['bytes']}]}
(out / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
for name in ('layout-results.json', 'compile-results.json', 'income-390.png', 'income-320-large.png'):
    shutil.copy2(proof / name, out / name)
for name in ('income-categories-frontend.log', 'income-categories-backend.log'):
    shutil.copy2(root.parent / 'test-results' / name, out / name)
(out / '中文更新说明.md').write_text('''# 收入分类补齐为两行四列

新增收入分类：奖金补贴（奖金、津贴等实际到账）、经营收入（经营收款）、报销回款（报销到账）。原有工资、兼职、红包礼金、投资收益不变，其他移到最后，合计8项，两行四列。支出分类与原有退款规则保持不变。新增分类复用已有手绘小图标，没有新增图片。

## 手动更新顺序

1. 备份当前前后端包。先将catpaw-miniprogram.zip解压到新目录，在微信开发者工具内编译、检查收入8个分类。
2. 前端准备好后，将palm-api-income-categories-python310.zip更新到原palm-api，沿用原Python3.10及所有原配置。无需修改支付、通知、桥接、数据库索引或环境变量。
3. 确认后端更新成功后，再扫码确认新分类能保存及查看，随后手动上传、提审、发布新版前端。新前端不能长期连接旧后端，否则新增分类保存会被旧分类校验拒绝。后端新增分类兼容旧版前端和历史账目。
4. 不要删除订单、账目或任何数据库集合。本轮未自动部署、发布、付款或修改真实数据。

前端包含此前“生活收藏册”信封位置、保存物品柔和底色等已交付调整；本次相对上一包仅修改utils/ledger.js。后端相对成长册交付版本仅修改palm/ledger.py，依赖沿用已固定版本。

## 验证与校验

前端419项回归、记账后端34项回归（本地数据库和CloudBase隔离存储，覆盖新增分类保存、修改、筛选及统计）、24项宽度／放大字号布局检查、微信模板与样式编译均通过。未执行真实付款或真机生产账户测试。新后端已验证Python3.10语法，保留原Linux依赖及可执行启动脚本权限。

完整前端包仍低于2MiB；两个包均已检查ZIP完整性、源文件一致性及SHA-256。校验值见对应zip.sha256与upload-manifest.json。
''', encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
