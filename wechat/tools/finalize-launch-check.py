"""Collect completed local evidence and write the human launch handoff."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
WECHAT = ROOT / 'wechat'
OUT = WECHAT / 'deploy/cloudbase/beauty-icons-20261018'
RESULTS = ROOT / 'test-results'


def read_json(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))


def read_log(p):
    raw = p.read_bytes()
    return raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')


def main():
    manifest = read_json(OUT / 'upload-manifest.json')
    cleanup_path = OUT / '上线清尾清单.json'
    cleanup = read_json(cleanup_path)
    assert cleanup['deleted'] and all(not Path(r['path']).exists() for r in cleanup['delete_files'])
    for row in cleanup['art_evidence']:
        assert hashlib.sha256(Path(row['preserved_art']).read_bytes()).hexdigest() == row['art_sha256']
    tests = {}
    for name in ('frontend', 'packed'):
        raw = read_log(RESULTS / ('launch-' + name + '.log'))
        count = int(re.search(r'# tests (\d+)', raw).group(1))
        assert f'# pass {count}' in raw and '# fail 0' in raw
        tests[name] = count
    raw = read_log(RESULTS / 'launch-backend.log')
    assert raw.rstrip().endswith('OK')
    backend = int(re.search(r'Ran (\d+) tests', raw).group(1))
    layout = read_json(RESULTS / 'launch-layout/layout-results.json')
    compile_result = read_json(RESULTS / 'launch-native/compile-results.json')
    native = [read_json(RESULTS / ('launch-native/' + suite + '/native-results.json')) for suite in ('motion', 'beauty-icons')]
    assert layout['passed'] and compile_result['passed'] and all(r['passed'] for r in native)
    assert all(r['cloudWrites'] == 0 and r['realPayments'] == 0 for r in native)
    packages = list((WECHAT / 'deploy').rglob('*.zip'))
    assert len(packages) == 7
    for p in packages:
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None
        assert hashlib.sha256(p.read_bytes()).hexdigest() == p.with_suffix('.zip.sha256').read_text(encoding='utf-8-sig').split()[0]
    for name in ('catpaw-miniprogram.zip', 'palm-api-beauty-icons-python310.zip', 'palm-api-bridge-node20.zip'):
        # There are two frontend names in the inventory; select the current path.
        row = next(r for r in cleanup['retained_packages'] if Path(r['path']).parent == OUT and Path(r['path']).name == name)
        assert row['sha256'] == hashlib.sha256((OUT / name).read_bytes()).hexdigest(), name
    config = read_json(RESULTS / 'launch-config.json')
    assert not config['devLogin'] and config['transport'] == 'cloud_http_function' and config['bridge'] == 'palm-api-bridge'
    with zipfile.ZipFile(OUT / 'catpaw-miniprogram.zip') as z:
        build = read_json(RESULTS / 'beauty-icons-build.json')
        assert set(z.namelist()) == {r['name'] for r in build['files']}
        for row in build['files']:
            assert hashlib.sha256(z.read(row['name'])).hexdigest() == row['sha256']
        assert len([n for n in z.namelist() if n.startswith('assets/item-covers/') and n.endswith('.png')]) == 100
        assert not any(any(s in n for s in ('qa-fixture', 'api-original', 'project.private', '.sqlite3', '.env')) for n in z.namelist())
    zip_after = sum(p.stat().st_size for p in packages)
    art_bytes = sum(Path(r['preserved_art']).stat().st_size for r in cleanup['art_evidence'])
    image_removed = sum(r['bytes'] for r in cleanup['delete_files'] if r['kind'] in ('excluded_unused_runtime_png', 'relocated_unused_runtime_svg'))
    cleanup['after_zip_count'] = len(packages)
    cleanup['after_zip_bytes'] = zip_after
    cleanup['current_retained_packages'] = [{'path': str(p.resolve()), 'bytes': p.stat().st_size,
                                           'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in packages]
    cleanup['space'] = {'zip_net_reduction_bytes': cleanup['before_zip_bytes'] - zip_after,
                        'runtime_art_removed_bytes': image_removed, 'preserved_art_bytes': art_bytes,
                        'art_net_reduction_bytes': image_removed - art_bytes,
                        'main_package_reduction_bytes': 0}
    cleanup_path.write_text(json.dumps(cleanup, ensure_ascii=False, indent=2), encoding='utf-8')
    proof = OUT / '上线检查记录'
    proof.mkdir(exist_ok=True)
    for name in ('launch-frontend.log', 'launch-packed.log', 'launch-backend.log', 'launch-config.json'):
        shutil.copy2(RESULTS / name, proof / name)
    shutil.copy2(RESULTS / 'launch-layout/layout-results.json', proof / 'layout-results.json')
    shutil.copy2(RESULTS / 'launch-package-audit/package-audit.json', proof / 'package-audit.json')
    shutil.copy2(RESULTS / 'launch-native/compile-results.json', proof / 'compile-results.json')
    for suite in ('motion', 'beauty-icons'):
        shutil.copy2(RESULTS / ('launch-native/' + suite + '/native-results.json'), proof / (suite + '-native-results.json'))
    shots = OUT / '上线检查截图'
    shots.mkdir(exist_ok=True)
    for suite in ('motion', 'beauty-icons'):
        for p in (RESULTS / ('launch-native/' + suite)).glob('*.png'):
            shutil.copy2(p, shots / p.name)
    for name in ('picker-large-320.png', 'picker-768.png'):
        shutil.copy2(RESULTS / 'launch-layout' / name, shots / name)
    result = {'passed': True, 'frontend_tests': tests, 'backend_tests': backend,
              'layout_cases': layout['cases'], 'compile_checks': len(compile_result['checks']),
              'native_checks': sum(len(r['checks']) for r in native), 'production_config': config,
              'all_7_archive_crc_and_sha256_verified': True, 'frontend_zip_matches_current_build': True,
              'main_package_bytes': build['bytes'], 'main_package_reduction_bytes': 0,
              'business_logic_changed': False, 'real_device_verified': False, 'deployed': False,
              'real_data_modified': False, 'cloud_writes': 0, 'real_payments': 0}
    (proof / 'checks.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    manifest['launch_cleanup'].update(result)
    (OUT / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    table = '\n'.join('| ' + row['file'] + ' | `' + row['sha256'] + '` |' for row in manifest['bundles'])
    freed_mib = (cleanup['space']['zip_net_reduction_bytes'] + cleanup['space']['art_net_reduction_bytes']) / 1024**2
    manual = f'''# 上线清尾与检查说明

当前上线候选为100图标版。本次只清理本地历史文件、整理绘图源文件和打包配置；业务代码、前端运行包与后端运行包均未改变，未部署或修改真实资料。

## 最终文件与保留范围

- `catpaw-miniprogram.zip`：当前完整前端，导入新的空目录检查，不将说明和截图一起导入。
- `palm-api-beauty-icons-python310.zip`：100图标版后端，Python3.10，已有部署若已与此包一致，无需因本次清尾重复更新。
- `palm-api-bridge-node20.zip`：当前匹配的桥接包，原样保留。前端仍使用palm-api-bridge，不要删除线上桥接函数；若线上已是同版本，也不用重复更新。
- `catpaw-editable-source-and-icons.zip`：更新后的可编辑前端和100个SVG备份，包含当前构建脚本；不是直接上传的主包。
- 上一版90图标的三份完整ZIP保存在同级`cover-expansion-20261018`目录。新图标投入使用后，不直接回退后端白名单；界面回退时优先保留新版后端。

## 清理结果

原85个部署ZIP现保留7个：当前4个（含必要桥接）、上一版3个。删除79个旧ZIP及77个对应校验文件；未删除历史说明、截图、源码、数据库或云端文件。

删除85张已停用、已排除上传的运行PNG，并将对应74个SVG源文件移到`wechat/branding/retired-runtime-assets-20261018`。另11张没有独立SVG的旧绘图，已把PNG原图保存在同一目录。所有保存源文件均核对SHA256一致。100个物品图标、现有猫咪插画、动态头像／月份图、回退图片和小报导出资源保留。

旧ZIP净释放{cleanup['space']['zip_net_reduction_bytes']:,}字节；扣除保留绘图源文件后的图片净释放{cleanup['space']['art_net_reduction_bytes']:,}字节，合计约{freed_mib:.2f}MiB。该数字不含新增检查截图与说明占用。图片原先已排除上传，因此主包减少0字节；实际前端包与上次100图标版SHA256相同。

具体路径、原始大小、SHA256、绘图保存位置及清理后包清单见[上线清尾清单.json](上线清尾清单.json)。历史文档中的已清理ZIP链接仅作记录，不再用于新部署。

## 检查结果

- 清理后源码{tests['frontend']}项、实际构建模块{tests['packed']}项前端检查通过；相关后端{backend}项回归通过，使用隔离SQLite／模拟CloudBase与支付响应。
- {layout['cases']}种实际模板布局检查通过，覆盖320／390／430／768宽度、大字号、短屏及40／90／100图标能力。
- 微信开发者工具24个页面、{len(compile_result['checks'])}项模板／样式编译通过；{result['native_checks']}项最终构建的离线模拟器交互通过。
- 模拟器覆盖四个主页面、工具收放、统计快速切换、记账分类、账本中文输入及预览、预算草稿取消与键盘状态、收藏册窗口、会员公告信封动画、账号隔离及100图标兼容。数据与支付均为离线样例，隔离窗口已关闭。
- 当前配置为正式云函数传输、DEV_LOGIN=false；100个图标、24条页面路由、173处静态图片引用、动态月报图片、7个ZIP的完整性及校验值通过。
- 主包文件量{build['bytes']:,}字节，通过本地2MiB检查，剩余{2*1024*1024-build['bytes']:,}字节；最终预览／上传体积仍以微信开发者工具为准。本轮未添加运行资源、依赖或业务规则。
- 没有发现本轮需要修改的业务缺陷。只清理过时打包规则，并把检查停用旧月报图片的历史测试，改为验证当前12个月封面及实际导出图片。

详细结果在[上线检查记录/checks.json](上线检查记录/checks.json)，实际模拟器截图在“上线检查截图”目录。安卓与苹果真机的键盘、相机、授权、支付及低端设备滚动尚需你扫码确认；本地模拟器通过不代表真实支付已经完成验收。

## 手动上线顺序

1. 解压当前前端到新的空目录，导入开发者工具并扫码确认真机表现，检查预览体积。不要直接把源码备份或整个交付目录上传。
2. 若线上后端尚未支持100个图标，手动更新当前palm-api包，保留原配置，确认`/auth/me`能力`item_cover_icons=true`且`item_cover_icons_version=3`后再发布前端。若线上已是此版本，不重复更新。桥接仅在代码版本不匹配时更新。
3. 核对线上开发登录及测试支付开关关闭，月／季商品及原支付通知、补单任务正确；本次没有读取或修改线上环境变量，不新增索引、集合或配置项。
4. 用测试账号确认新增／编辑、容量边界、记账、预算、签到、会员订单核对等主要流程，再由你手动提审发布。不要为了验收清空真实数据。
5. 保存当前包与上一版备份。后续有新图标资料后，不缩回后端白名单；不删除订单、授权或赠送记录。

## 以后重新打包

在完整仓库中先运行`node wechat/tools/build-beauty-icons.cjs`生成压缩构建，再运行`wechat/.venv/Scripts/python.exe wechat/tools/prepare-current-release.py`。Terser使用已安装微信开发者工具的配套版本；首次准备或本地缓存不存在时用`extract-wechat-terser.py`恢复，不新增小程序运行依赖。

当前打包入口只使用源码、当前构建清单，以及本目录保留的API／桥接包中的固定依赖，不再依赖已删除的历史ZIP。后端源码未变时保持原包字节与校验值；有变化时才离线重建。原有按日期命名的发布脚本保留为历史记录，不作为新版本打包入口。

## SHA256

| 文件 | SHA256 |
|---|---|
{table}

每个ZIP旁还有同名`.zip.sha256`文件；本次未自动部署、发布、付款或修改真实账户数据。
'''
    (OUT / '上线清尾与检查说明.md').write_text(manual, encoding='utf-8')
    old_manual = OUT / '中文更新步骤.md'
    text = old_manual.read_text(encoding='utf-8')
    marker = '> 上线前清尾已完成：'
    if not text.startswith(marker):
        old_manual.write_text(marker + '最终文件、当前校验值与清理后操作以[上线清尾与检查说明](上线清尾与检查说明.md)为准；以下保留100图标版本的原更新记录。\n\n' + text, encoding='utf-8')
    print(json.dumps({'passed': True, 'zip_count': len(packages), 'net_reclaimed_mib_before_new_evidence': round(freed_mib, 2), **result}, ensure_ascii=False))


if __name__ == '__main__':
    main()
