"""Package verified front-end only. No deployment or production access."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
project = root / 'miniprogram'
out = root / 'deploy/cloudbase/discovery-journal-20261018'
proof = root / 'docs/images/discovery-journal-20261018'
baseline = root / 'deploy/cloudbase/motion-20261018/catpaw-miniprogram.zip'
out.mkdir(parents=True, exist_ok=True)
log = (root.parent / 'test-results/discovery-frontend.log').read_text(encoding='utf-8-sig')
count = int(re.search(r'# tests (\d+)', log).group(1))
assert f'# pass {count}' in log and '# fail 0' in log
results = {n: json.loads((proof / n).read_text(encoding='utf-8-sig')) for n in ('layout-results.json', 'compile-results.json', 'native-results.json')}
assert all(r['passed'] for r in results.values())
config = json.loads((project / 'project.config.json').read_text(encoding='utf-8'))


def match(name, rule):
    kind, value = rule['type'], rule['value']
    return kind == 'file' and name == value or kind == 'folder' and name.startswith(value + '/') or kind == 'suffix' and name.endswith(value)


def ignored(name):
    return any(match(name, r) for r in config['packOptions']['ignore']) and not any(match(name, r) for r in config['packOptions'].get('include', []))


files = {p.relative_to(project).as_posix(): p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules', '.git', '__pycache__'})}
with zipfile.ZipFile(baseline) as archive:
    changed = [n for n, p in files.items() if n not in archive.namelist() or p.read_bytes() != archive.read(n)]
    deleted = sorted(set(archive.namelist()) - set(files))
    prior_size = sum(i.file_size for i in archive.infolist())
assert deleted == ['assets/white-doodle/compact-discover.png']
assert set(changed) == {'pages/me/index.wxml', 'pages/me/index.js', 'pages/insights/index.js', 'pages/insights/index.wxml', 'pages/insights/index.wxss', 'utils/discovery.js', 'project.config.json'}
assert not any('qa-fixture' in n or 'api-original' in n for n in files)
for name in ('app.js', 'config.js'):
    assert 'isolated-rewards-' not in files[name].read_text(encoding='utf-8')
with zipfile.ZipFile(root / 'deploy/cloudbase/income-categories-20261018/palm-api-income-categories-python310.zip') as archive:
    for p in (root / 'backend/palm').glob('*.py'):
        assert p.read_bytes().replace(b'\r\n', b'\n') == archive.read('palm/' + p.name)

bundle = out / 'catpaw-miniprogram.zip'
with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, p in files.items():
        archive.write(p, name)
with zipfile.ZipFile(bundle) as archive:
    assert archive.testzip() is None
    assert all(archive.read(n) == p.read_bytes() for n, p in files.items())
    size = sum(i.file_size for i in archive.infolist())
    assert size < 2 * 1024 * 1024
digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
bundle.with_suffix('.zip.sha256').write_text(digest + '  ' + bundle.name + '\n', encoding='utf-8')
manifest = {'release': out.name, 'deployed': False, 'api_unchanged': True, 'cloud_writes': 0, 'real_device_verified': False,
    'frontend_tests': count, 'layout_checks': len(results['layout-results.json']['checks']),
    'wechat_compile_checks': len(results['compile-results.json']['checks']), 'wechat_runtime_checks': len(results['native-results.json']['checks']),
    'changed_frontend_files': changed, 'excluded_unused_art': deleted, 'source_images_modified': [],
    'bundles': [{'file': bundle.name, 'sha256': digest, 'bytes': bundle.stat().st_size, 'uncompressed_bytes': size,
                 'net_added_bytes': size - prior_size, 'source_files': len(files)}]}
(out / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
for name in results:
    shutil.copy2(proof / name, out / name)
shutil.copy2(root.parent / 'test-results/discovery-frontend.log', out / 'frontend-tests.log')
shots = out / '截图'
shots.mkdir(exist_ok=True)
for name in ('default-390.png', 'expanded-390.png', 'failure-390.png', 'long-320-large.png', 'discovery-native.png', 'expanded-native.png', 'me-native.png'):
    shutil.copy2(proof / name, shots / name)
manual = f'''# 小小发现：轻巧提醒手账更新

## 这次改了什么

“我的”不再显示“小小发现”入口；请从“统计 → 物品 → 小小发现 → 查看全部分析”打开，也可点击该区域的具体提醒直接定位。

发现页优先展示即将过保、手动闲置、长期未记录使用、已过保与记录缺口，之后展示费用和资产结构。保留原计算规则，不自动修改物品状态。卡片使用已有手绘图标，先显示结论；“查看依据”可以展开完整解释。关联物品先显示3件，点击“展开其余X件”查看全部，物品名称仍可进入详情。

下方改为紧凑概览、“费用明细”、本月收藏小报和折叠的六个月订阅／分期趋势。缺失的订阅／分期金额显示“暂不可用”，不误显示为0。

同账号返回页面保留内容、滚动位置和本次的收放选择；重新打开页面恢复默认折叠。已有数据刷新失败时保留画面并给出重试。账号切换隔离旧内容与响应。统计和发现复用现有15秒展示缓存，主动下拉刷新和点击重试重新读取；月报仍独立读取，不阻塞提醒定位。没有更改保存、支付、容量或奖励验证。

## 手动更新步骤

1. 保留上一版前端包。将本目录的catpaw-miniprogram.zip解压到新目录，再导入微信开发者工具；截图、日志和说明留在包外。
2. 编译并预览，检查“我的”入口已删除，统计页入口、定向提醒、物品跳转、展开／收起、返回月报、刷新失败及账号切换。
3. 用安卓和苹果真机确认字体、触控、页面返回和滚动体验。真机验收后再由你手动上传、提审与发布。
4. 本轮无需重新上传palm-api，无数据库、索引、环境变量或数据迁移操作。若尚未更新此前新增收入分类的后端，继续按income-categories-20261018说明完成该轮更新；本轮没有新的后端要求。
5. 如需回退，使用motion-20261018或你保留的上一完整前端包。没有新增持久化收放状态，也无需修改历史数据。

## 验收与体积

前端{count}项回归、{manifest['layout_checks']}项布局与减少动态效果检查、{manifest['wechat_compile_checks']}项微信模板／样式编译、{manifest['wechat_runtime_checks']}项隔离微信模拟器交互检查全部通过。布局包含320／390／430／768宽度及放大字号，覆盖长名称、大金额、正常、加载、失败及空状态。模拟器使用离线资料，未访问生产账户或执行真实写入；真机尚待扫码确认。

截图中*-native.png来自实际微信模拟器，其余来自真实页面模板／样式的浏览器布局检查，均为隔离示例资料。

ZIP：{bundle.stat().st_size:,}字节；包内源文件：{size:,}字节，较上一版{size-prior_size:+,}字节，通过2MiB源文件体积自检；最终上传大小以开发者工具为准。未新增图片或依赖，仅排除已无运行时引用的旧发现入口小图标，其他共享图片保持清晰度。

SHA-256：{digest}

完整结果见frontend-tests.log、layout-results.json、compile-results.json、native-results.json；包文件与源文件一致性、ZIP CRC和SHA-256已校验。本轮未自动部署、上传、发布或修改真实账户数据。
'''
(out / '中文更新说明.md').write_text(manual, encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
