"""Front-end only; compare the API to the last delivered package, never deploy."""
from pathlib import Path
import hashlib, json, re, shutil, zipfile

root = Path(__file__).resolve().parents[1]
deploy = root / 'deploy/cloudbase'
out = deploy / 'motion-20261018'
proof = root / 'docs/images/motion-20261018'
project = root / 'miniprogram'
baseline = deploy / 'income-categories-20261018/catpaw-miniprogram.zip'
out.mkdir(parents=True, exist_ok=True)
raw = (root.parent / 'test-results/motion-frontend.log').read_bytes()
log = raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')
tests = int(re.search(r'tests (\d+)', log).group(1))
assert f'pass {tests}' in log and 'fail 0' in log
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
assert set(deleted) == {'assets/white-doodle/' + n + '.png' for n in ('camera-add', 'compact-keepsakes', 'keepsakes', 'memory-book', 'memory-stamp')}
assert not any('qa-fixture' in n or 'api-original' in n for n in files)
for name in ('app.js', 'config.js'):
    assert 'isolated-motion' not in files[name].read_text(encoding='utf-8')
with zipfile.ZipFile(deploy / 'income-categories-20261018/palm-api-income-categories-python310.zip') as archive:
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
before = json.loads((root.parent / 'test-results/motion-20261018/before.json').read_text(encoding='utf-8'))
after = json.loads((root.parent / 'test-results/motion-20261018/after.json').read_text(encoding='utf-8'))
manifest = {'release': out.name, 'deployed': False, 'api_unchanged': True, 'cloud_writes': 0, 'real_device_verified': False,
    'frontend_tests': tests, 'layout_checks': len(results['layout-results.json']['checks']),
    'wechat_compile_checks': len(results['compile-results.json']['checks']), 'wechat_runtime_checks': len(results['native-results.json']['checks']),
    'changed_frontend_files': changed, 'excluded_unused_art': deleted,
    'source_images_modified': [], 'source_images_deleted': [],
    'performance': {'isolated': True, 'repeated_visits': after['repeats']['visits'],
        'requests_before': before['repeats']['requests'], 'requests_after': after['repeats']['requests'],
        'setData_before': before['repeats']['setData'], 'setData_after': after['repeats']['setData'],
        'bytes_before': before['repeats']['bytes'], 'bytes_after': after['repeats']['bytes']},
    'bundles': [{'file': bundle.name, 'sha256': digest, 'bytes': bundle.stat().st_size, 'uncompressed_bytes': size, 'net_added_bytes': size - prior_size, 'source_files': len(files)}]}
(out / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
for name in results:
    shutil.copy2(proof / name, out / name)
shutil.copy2(root.parent / 'test-results/motion-frontend.log', out / 'frontend-tests.log')
for name in ('before.json', 'after.json', 'unused-art-audit.json'):
    shutil.copy2(root.parent / 'test-results/motion-20261018' / name, out / name)
shots = out / '截图与动效'
shots.mkdir(exist_ok=True)
for name in ('轻巧切换.gif', '纸片窗口.gif', 'ledger-tools-390.png', 'collection-320-large.png', 'me-390.png', 'income-native.png', 'collection-native.png', 'statistics-native.png', 'me-native.png'):
    shutil.copy2(proof / name, shots / name)
p = manifest['performance']
report = f'''# 前后性能与验收记录

## 控制测试

固定同一组隔离数据，每个模拟请求延迟8毫秒；四个主页面各首次进入一次，再循环切换5轮，共20次返回。测试不访问云端。

| 20次返回统计 | 调整前 | 调整后 |
|---|---:|---:|
| 实际读取次数 | {p['requests_before']} | {p['requests_after']} |
| 页面setData调用 | {p['setData_before']} | {p['setData_after']} |
| 页面更新数据字节数 | {p['bytes_before']:,} | {p['bytes_after']:,} |

读取减少{100*(1-p['requests_after']/p['requests_before']):.1f}%，页面更新数据减少{100*(1-p['bytes_after']/p['bytes_before']):.1f}%。原始耗时、请求路径、首次进入及滚动／窗口记录见before.json和after.json。耗时受本机调度影响，仅为脚本测量，不能换算为真机帧率或线上响应速度；没有宣称首次打开一定更快。

100次连续滚动事件在前后均没有产生页面数据更新。按钮与分栏先响应业务状态，视觉过渡不等待网络，不延迟保存或支付。

## 界面与运行时

前端{tests}项回归通过；实际WXML／WXSS布局{manifest['layout_checks']}项、微信模板与样式编译{manifest['wechat_compile_checks']}项、隔离微信模拟器{manifest['wechat_runtime_checks']}项通过。

布局覆盖320／390／430／768宽度、放大字号、账本／预算／外观／收藏册和禁用提交；采样真实样式动画，确认180毫秒结束、减少动态效果采用80毫秒，禁用按钮不缩放。模拟器覆盖快速收放、反复切换、原生新增菜单、中文输入控制器、键盘避让状态、预算取消、收藏册收尾、公告信封及账号切换。测试草稿仅清理隔离项目的本地数据。

动图为实际页面模板与样式的浏览器采样；*-native.png为隔离微信模拟器截图。未执行手机真机、真实付款或生产数据验收；安卓／苹果的真实键盘仍需扫码确认。

## 体积

ZIP为{bundle.stat().st_size:,}字节，原始文件合计{size:,}字节（较上一包{size-prior_size:+,}字节），通过沿用的2MiB源文件体积自检。清理“我的”里不可能匹配的旧记账样式，并排除5个确认未使用的旧图标；源图片全部保留、像素没有修改。没有新增大型图片、动图或依赖进入小程序包。ZIP CRC、源文件逐一一致性和SHA-256已检查。
'''
(out / '前后性能与验收记录.md').write_text(report, encoding='utf-8')
manual = '''# 轻巧可爱的动效与流畅度更新

## 这次调整

按钮轻按、选中图标轻弹、分栏柔和切换；底部导航在成功切换后反馈，原生页面跳转不额外等待。账本与预算、会员工具和归档分组平滑收放，纸片窗口短暂展开／收起。公告信封、每日问候、猫咪加载和领取爪印保留专属表现，不叠加通用效果。不新增声音或震动。

主页面已有内容不再在返回时清空；短期展示数据按环境、账号、完整筛选条件在内存复用15秒，同条件读取合并。成功增删改、恢复、移动及上传照片会使展示缓存失效；下拉刷新强制读取。没有把缓存用于下单、会员资格、容量限制或奖励发放。输入、草稿、排序、支付、会员期限及奖励规则不变。

减少动态效果时采用短淡入；不支持相关能力时正常回退。离开页面清理动画，切换账号立即关闭普通窗口并隔离旧数据。无持续滚动监听动画，无逐帧页面更新，列表不会逐项弹跳。

## 手动更新

1. 保留上一包备份。将catpaw-miniprogram.zip解压到一个新目录，再导入微信开发者工具。不要把截图、动图、日志及说明放进小程序目录。
2. 编译并在安卓／苹果扫码确认：四个主页面反复切换、分类选择、收放、弹窗、键盘、未保存草稿及公告关闭。系统付款和授权界面保持微信原生表现。
3. 验收后由你手动上传、提审、发布。本轮没有自动部署、上传或修改真实数据。
4. 本轮无需更新palm-api、桥接、通知、数据库或环境变量。若尚未更新上一轮新增收入分类的后端，仍应先按income-categories-20261018的说明完成该轮更新；本轮没有新的后端变更。
5. 校验值见catpaw-miniprogram.zip.sha256与upload-manifest.json。性能数字的适用范围、实际截图和测试结果见“前后性能与验收记录.md”。

如需回退前端，使用保留的上一完整前端包。本轮没有迁移本机存储或服务端数据，无需修改账户、余额、会员或历史记录。
'''
(out / '中文更新说明.md').write_text(manual, encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
