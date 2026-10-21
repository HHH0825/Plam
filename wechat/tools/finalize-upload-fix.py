"""Collect offline evidence for the 80051 main-package size fix."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'wechat/deploy/cloudbase/beauty-icons-20261018'
RESULTS = ROOT / 'test-results'


def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))


def test_count(p):
    raw = p.read_bytes()
    text = raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')
    count = int(re.search(r'# tests (\d+)', text).group(1))
    assert f'# pass {count}' in text and '# fail 0' in text
    return count


def main():
    build = read(RESULTS / 'beauty-icons-build.json')
    manifest = read(OUT / 'upload-manifest.json')
    compile_result = read(RESULTS / 'upload-fix-native/compile-results.json')
    load = read(RESULTS / 'upload-fix-native/load-results.json')
    native = [read(RESULTS / ('launch-native/' + suite + '/native-results.json')) for suite in ('motion', 'beauty-icons')]
    assert compile_result['passed'] and len(compile_result['checks']) == 24
    assert load['passed'] and len(load['checks']) == 8
    assert all(r['passed'] and r['cloudWrites'] == 0 for r in native)
    images = read(RESULTS / 'upload-fix-original-images.json')
    with zipfile.ZipFile(OUT / 'catpaw-miniprogram.zip') as z:
        assert z.testzip() is None
        for row in build['files']:
            assert hashlib.sha256(z.read(row['name'])).hexdigest() == row['sha256']
        for name, sha in images.items():
            assert hashlib.sha256(z.read(name)).hexdigest() == sha
        app = json.loads(z.read('app.json'))
        assert len(app['pages']) == 16 and len(app['subPackages']) == 8
    for row in manifest['bundles']:
        assert hashlib.sha256((OUT / row['file']).read_bytes()).hexdigest() == row['sha256']
    api = next(r for r in manifest['bundles'] if r['file'] == 'palm-api-beauty-icons-python310.zip')
    assert api['sha256'] == '44196719d551733b9a2600fbcc22bf0a7075e4f1267bfa2184a625a77d3b6a74'
    record = {'passed': True, 'error_addressed': '80051 source size exceeds 2MB', 'main_routes': 16, 'subpackage_routes': 8,
              'all_existing_urls_preserved': True, 'source_packages': build['sourcePackages'], 'built_packages': build['builtPackages'],
              'png_files_byte_identical': len(images), 'frontend_tests': test_count(RESULTS / 'upload-fix-frontend.log'),
              'built_tests': test_count(RESULTS / 'upload-fix-packed.log'), 'wechat_compile_checks': len(compile_result['checks']),
              'native_interactions': sum(len(r['checks']) for r in native), 'native_subpackage_loads': len(load['checks']),
              'backend_unchanged': True, 'business_logic_unchanged': True, 'uploaded': False, 'real_data_modified': False,
              'real_device_verified': False, 'actual_server_upload_size_verified': False}
    manifest['upload_fix'] = record
    (OUT / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    proof = OUT / '上传修复检查记录'
    proof.mkdir(exist_ok=True)
    for name in ('upload-fix-frontend.log', 'upload-fix-packed.log', 'upload-fix-source-sizes.json', 'upload-fix-package-audit.json'):
        shutil.copy2(RESULTS / name, proof / name)
    for name in ('compile-results.json', 'load-results.json'):
        shutil.copy2(RESULTS / 'upload-fix-native' / name, proof / name)
    for suite in ('motion', 'beauty-icons'):
        shutil.copy2(RESULTS / ('launch-native/' + suite + '/native-results.json'), proof / (suite + '-native-results.json'))
    (proof / 'checks.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    front = next(r for r in manifest['bundles'] if r['file'] == 'catpaw-miniprogram.zip')
    package_rows = '\n'.join(f"| {name} | {size:,} | {build['builtPackages']['packages'][name]:,} |" for name, size in build['sourcePackages']['packages'].items())
    text = f'''# 上传超限修复说明

本次处理微信上传错误80051：`source size 2152KB exceed max limit 2MB`。它是包体超限，不是普通断网问题。

此前可编辑源码参与上传的文件量为2,203,682字节（约2152KB），与报错一致。原交付构建虽通过本地总文件量检查，但只留约5KB余量；这种检查对源码目录和微信实际打包不够稳妥。现在改为主包／各分包分别检查，并同时约束未压缩源码与交付构建，每包采用1.9MiB的保守本地预算。

## 你现在怎么上传

1. 重新下载当前目录中的[catpaw-miniprogram.zip](catpaw-miniprogram.zip)，解压到新的空文件夹，在微信开发者工具导入直接包含`app.json`和`project.config.json`的目录。不要把整个交付目录或可编辑源码备份当作上传目录。
2. 重新编译，确认编译没有报错。AppID仍用原来的；版本号继续填写`1.0.0`，备注可继续使用之前的首版说明。
3. 开发者工具的包体／代码依赖分析应区分主包与8个分包，再重试上传。整个目录或ZIP的合计大小不等于主包大小；下表是本地文件量核对，最终服务端结果仍以你的上传为准。
4. 若你一直使用仓库内`wechat/miniprogram`原工程，该工程的`app.json`也已同步修复，重新编译后即可重试；使用旧解压目录时必须换成新包，旧目录不会自动更新。
5. 无需重新上传palm-api或桥接函数；没有修改价格、权益、接口、数据库、登录或支付逻辑。本次未自动上传、发布或修改真实账户数据。

## 调整后的大小

源码主包：**{build['sourcePackages']['mainBytes']:,}字节，约{build['sourcePackages']['mainBytes']/1024:.2f}KB**。

正式构建主包：**{build['builtPackages']['mainBytes']:,}字节，约{build['builtPackages']['mainBytes']/1024:.2f}KB**；相对2MiB本地限制余量约**{(2*1024*1024-build['builtPackages']['mainBytes'])/1024:.2f}KB**。

| 包 | 源码字节 | 正式构建字节 |
|---|---:|---:|
{package_rows}

把编辑物品、详情、月报、订阅／分期、收纳、会员、会员工具、签到喵铺这8个非首页页面配置为普通分包。没有移动实际文件，原24个页面URL、页面入口、参数及相对依赖路径全部保留；四个底部栏目和登录页仍在主包。按需加载交给微信处理，不增加自制等待或更改页面布局。

254张运行PNG与修复前逐字节一致，包括刚扩展的100个物品图标和问候插画；没有缩尺寸、降低清晰度或换图片格式。

## 本地验证

源码{record['frontend_tests']}项、正式构建{record['built_tests']}项前端检查通过；新增检查覆盖24个旧URL、底部栏目归属、分包根目录与源码主包体积预算。四个主页面和8个分包页面的24项微信模板／样式编译通过，原16项离线交互通过，另通过原生页面跳转实际打开全部8个分包页面。详细结果见[上传修复检查记录/checks.json](上传修复检查记录/checks.json)。

后端包SHA256保持原值，相关业务代码没有变化，沿用上一轮238项后端回归结果。本轮没有实际执行服务端上传，也没有自动发布；真机扫码及最终上传由你确认。

## 校验

当前前端SHA256：`{front['sha256']}`。

同名`.zip.sha256`和`upload-manifest.json`已同步更新；旧清尾说明中的“运行包保持不变”及旧前端校验值属于此前记录，以本次修复说明及当前清单为准。
'''
    (OUT / '上传超限修复说明.md').write_text(text, encoding='utf-8')
    for name in ('上线清尾与检查说明.md', '中文更新步骤.md'):
        p = OUT / name
        old = p.read_text(encoding='utf-8')
        marker = '> 后续上传修复：'
        if not old.startswith(marker):
            p.write_text(marker + '当前前端已改为分包，请优先阅读[上传超限修复说明](上传超限修复说明.md)，使用最新ZIP和SHA256。下文保留此前检查记录。\n\n' + old, encoding='utf-8')
    print(json.dumps({'front': front, **record}, ensure_ascii=False))


if __name__ == '__main__':
    main()
