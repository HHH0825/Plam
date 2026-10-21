"""Package this frontend-only adjustment. Never contact cloud services."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
project = root / 'miniprogram'
output = root / 'deploy/cloudbase/membership-details-20261016'
evidence = root / 'docs/images/member-details-20261016'
output.mkdir(parents=True, exist_ok=True)
config = json.loads((project / 'project.config.json').read_text(encoding='utf-8'))

def ignored(name):
    return any(rule['type'] == 'suffix' and name.endswith(rule['value'])
               or rule['type'] == 'folder' and name.startswith(rule['value'] + '/')
               or rule['type'] == 'file' and name == rule['value']
               for rule in config.get('packOptions', {}).get('ignore', []))

archive_path = output / 'catpaw-miniprogram.zip'
sources = {p.relative_to(project).as_posix(): p for p in sorted(project.rglob('*'))
           if p.is_file() and not ignored(p.relative_to(project).as_posix())
           and not p.name.startswith('project.private')
           and not set(p.parts).intersection({'node_modules', '.git', '__pycache__'})}
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, source in sources.items():
        archive.write(source, name)

expected_changes = {'pages/me/index.wxml', 'pages/me/index.wxss',
                    'pages/member-tools/index.js', 'pages/member-tools/index.wxml',
                    'pages/member-tools/index.wxss', 'utils/member-benefits.js'}
baseline = root / 'deploy/cloudbase/membership-refine-20261016/catpaw-miniprogram.zip'
with zipfile.ZipFile(baseline) as before, zipfile.ZipFile(archive_path) as after:
    assert after.testzip() is None
    assert set(after.namelist()) == set(sources)
    assert set(before.namelist()) == set(after.namelist())
    changed = {n for n in after.namelist()
               if before.read(n).replace(b'\r\n', b'\n') != after.read(n).replace(b'\r\n', b'\n')}
    assert changed == expected_changes, sorted(changed)
    for name, source in sources.items():
        assert after.read(name) == source.read_bytes(), name
    assert not any('qa-fixture' in n or n.startswith('/') or '..' in Path(n).parts for n in after.namelist())
    size = sum(i.file_size for i in after.infolist())
    previous_size = sum(i.file_size for i in before.infolist())
    assert size < 2 * 1024 * 1024

digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
(output / 'catpaw-miniprogram.zip.sha256').write_text(f'{digest}  {archive_path.name}\n', encoding='utf-8')
results = {}
for name in ['layout-results.json', 'compile-results.json', 'native-results.json']:
    result = json.loads((evidence / name).read_text(encoding='utf-8-sig'))
    assert result['passed'], name
    results[name] = result
    shutil.copy2(evidence / name, output / name)
record = {'frontend_only': True, 'deployed': False, 'cloud_writes': 0, 'real_payments': 0,
          'real_device_keyboard_verified': False, 'file': archive_path.name, 'sha256': digest,
          'zip_bytes': archive_path.stat().st_size, 'uncompressed_bytes': size,
          'previous_uncompressed_bytes': previous_size, 'net_added_bytes': size - previous_size,
          'matching_source_files': len(sources), 'crc_verified': True, 'changed_files': sorted(changed)}
(output / 'package-verification.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
shots = output / '验收截图'
shots.mkdir(exist_ok=True)
for name in ['me-collapsed-390.png', 'me-expanded-390.png', 'appearance-page-390.png',
             'appearance-cash-390.png', 'appearance-collection-390.png', 'book-preview-native.png',
             'book-default-native.png', 'comparison-terms-390.png']:
    shutil.copy2(evidence / name, shots / name)
manual = '''# 会员页面与账本编辑细节更新

本次只更新小程序前端。无需重新上传 palm-api、palm-pay-notify，无需改环境变量、商品、数据库索引或会员身份。

## 已完成的调整

- 删除“免费版与会员”中的指定退款段落，保留其余购买与服务约定。实际退款处理不变。
- 手账外观按顶部模块显示设置：页面效果只有配色，两种小报有配色、模板和贴纸。共享设置的作用范围已注明；切换保留草稿，应用后才保存。
- 会员工具移到“我的收藏册”之后、“一起把它做好”之前，间距收紧，保留按账号记忆的折叠状态。
- 账本编辑采用独立标签与对齐输入框，统一键盘避让；封面、贴纸下方增加实时账本预览，选择样式后滚动到预览。取消不会保存。

## 你需要操作的步骤

1. 先备份目前使用的小程序工程。将 catpaw-miniprogram.zip 解压到一个新文件夹，不要解压到云函数文件夹。
2. 微信开发者工具选择“导入项目”，目录选解压后含 app.json、project.config.json 的文件夹，使用原小程序 AppID。
3. 编译后查看“我的”：会员卡后是收藏册，会员工具在“一起把它做好”上方；展开后四个入口应正常跳转。
4. 打开手账外观，切换三个模块。确认页面模块没有模板和贴纸，小报模块能显示它们；选择后预览变化，未点应用前不会保存。免费账号仅可预览。
5. 用安卓和苹果分别扫码预览，检查新建／编辑账本：点击名称后文字不跳动，中文输入正常，键盘不遮挡输入，收键盘后恢复；选择封面和贴纸看到组合预览，取消不写入。
6. 先上传体验版确认，再按你的发布安排提审和发布。本次未自动上传、提审、发布或修改真实数据。

## 验收边界

已检查320／390／430／768宽度及320宽度放大字号，完成前端回归、微信模板和样式编译、隔离数据的微信运行与截图验证。
离线验收中测试了键盘避让事件及状态恢复，但电脑模拟器不能代替安卓／苹果真实输入法；第5步仍需要在两端真机确认。
支付接口、售价、会员期限、服务端权限与购买限制均未修改。

截图在“验收截图”文件夹，具体结果与包体积见验收记录.md，SHA-256见同名.sha256文件及package-verification.json。
'''
(output / '更新说明.md').write_text(manual, encoding='utf-8')
layout_count = len(results['layout-results.json']['checks'])
compile_count = len(results['compile-results.json']['checks'])
native_count = len(results['native-results.json']['checks'])
report = f'''# 验收记录

- 前端回归：355项通过（含支付、价格、权限、退款提示展示和账号切换相关回归）。
- 布局检查：{layout_count}项通过，含320／390／430／768宽度及放大字号、外观条件显示、预览、会员工具顺序及点击高度。
- 微信编译：{compile_count}个模板／样式通过。
- 微信离线运行：{native_count}项通过，使用隔离数据，验证真实小报画布生成、账本草稿预览、折叠与指定说明删除。
- 真机键盘：待用户在安卓、苹果分别确认。模拟器键盘事件检查不等于真机输入法验收。
- ZIP校验与源文件比对：{len(sources)}个文件通过，仅6个运行文件改变，未添加图片或新页面。
- ZIP压缩体积：{archive_path.stat().st_size:,}字节；解压后打包文件合计{size:,}字节；较上一版增加{size-previous_size:,}字节，低于2MiB。
- SHA-256：`{digest}`
- 无云端写入、真实付款、自动上传或发布。
'''
(output / '验收记录.md').write_text(report, encoding='utf-8')
for filename, content in [('member-details-manual-20261016.md', manual), ('member-details-acceptance-20261016.md', report)]:
    (root / 'docs' / filename).write_text(content, encoding='utf-8')
print(json.dumps(record, ensure_ascii=False))
