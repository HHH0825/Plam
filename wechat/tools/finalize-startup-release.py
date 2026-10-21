"""Assemble verified frontend-only release notes and evidence. No network access."""
from pathlib import Path
import hashlib
import json
import shutil
import statistics
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / 'test-results/startup-share-20261020'
OUT = ROOT / 'wechat/deploy/cloudbase/beauty-icons-20261018'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    native = read(PROOF / 'native/checks.json')
    routes = {row.get('route') or row.get('state', {}).get('route') for row in native['checks']}
    routes.discard(None)
    assert len(routes) == 24 and all(row.get('passed', row.get('invitation')) for row in native['checks'])
    for name in ('source-tests.log', 'built-tests.log'):
        text = (PROOF / name).read_text(encoding='utf-8-sig')
        assert 'pass 462' in text and 'fail 0' in text
    build = read(ROOT / 'test-results/beauty-icons-build.json')
    manifest = read(OUT / 'upload-manifest.json')
    bundles = manifest['bundles']
    pinned = {'palm-api-beauty-icons-python310.zip': '44196719d551733b9a2600fbcc22bf0a7075e4f1267bfa2184a625a77d3b6a74',
              'palm-api-bridge-node20.zip': '4cd70a95742f0ccf2e7f0a5038459479961f28ec4fe261d3334cb1a32dd80f48'}
    for bundle in bundles:
        file = OUT / bundle['file']
        assert hashlib.sha256(file.read_bytes()).hexdigest() == bundle['sha256']
        with zipfile.ZipFile(file) as z:
            assert z.testzip() is None
        if bundle['file'] in pinned:
            assert bundle['sha256'] == pinned[bundle['file']]
    evidence = OUT / '启动与分享验收'
    evidence.mkdir(exist_ok=True)
    for name in ('before-native.json', 'after-ready-native.json', 'after-native.json', 'source-tests.log', 'built-tests.log'):
        shutil.copy2(PROOF / name, evidence / name)
    for name in ('checks.json', 'console.json', 'console-final.json', 'login-native.png', 'items-native.png', 'rewards-native.png'):
        file = PROOF / 'native' / name
        if file.exists():
            shutil.copy2(file, evidence / name)
    for name in ('layout-source', 'layout-built', 'feedback-layout', 'feedback-layout-built'):
        for file in (PROOF / name).glob('*'):
            if file.suffix == '.json' or file.name in ('login-320-1.png', 'login-390-1.png', 'login-430-1.png', 'login-768-1.png', 'greeting-390.png', 'capacity-320-large.png'):
                target = evidence / name
                target.mkdir(exist_ok=True)
                shutil.copy2(file, target / file.name)
    art = ROOT / 'wechat/branding/startup-share-20261020'
    shutil.copy2(ROOT / 'wechat/miniprogram/pages/rewards/assets/invitation.png', OUT / '邀请卡片封面.png')
    shutil.copy2(art / 'invitation-chat-preview.png', OUT / '邀请卡片聊天预览.png')
    performance = {'environment': 'Windows WeChat developer tools 2.02.2609231, library 3.17.3; offline fixtures',
                   'real_device': False, 'first_package_download_measured': False, 'samples_per_version': 5}
    for name in ('before', 'after'):
        data = read(PROOF / (name + '-native.json'))
        values = [next(e['at'] for e in row['runtime']['qa']['events'] if e['route'] == 'pages/login/index' and e['event'] == 'onReady') for row in data['samples']]
        performance[name] = {'login_ready_ms': values, 'median_ms': statistics.median(values), 'max_ms': max(values),
                             'requests_before_login': [len(row['runtime']['qa']['requests']) for row in data['samples']]}
    (evidence / '性能对比.json').write_text(json.dumps(performance, ensure_ascii=False, indent=2), encoding='utf-8')
    current = {'date': '2026-10-20', 'suggested_version': '1.0.1', 'frontend_tests': 462, 'packed_tests': 462,
               'native_page_routes': 24, 'native_compile_checks': 52, 'login_layout_cases_per_build': 72,
               'feedback_layout_cases_per_build': 16, 'existing_pngs_unchanged': 254,
               'invitation_png_bytes': 21970, 'backend_changed': False, 'bridge_changed': False,
               'deployed': False, 'real_data_modified': False, 'performance': performance,
               'limitations': ['手机首次下载与安卓、苹果真机待用户确认', '原始webviewId报错未在本轮隔离环境复现，不能声称全面修复平台路由问题',
                               '微信代码质量主包1.5M与总媒体200K建议本轮未重新扫描，沿用历史未通过记录']}
    current['fixture_missing_routes'] = [row['state']['route'] for row in native['checks'] if row.get('state', {}).get('error')]
    manifest['current_frontend'] = current
    manifest['frontend_tests'] = {'frontend': 462, 'packed': 462}
    (OUT / 'upload-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'SHA256SUMS.txt').write_text(''.join(b['sha256'] + '  ' + b['file'] + '\n' for b in bundles), encoding='utf-8')
    front = next(b for b in bundles if b['file'] == 'catpaw-miniprogram.zip')
    source = next(b for b in bundles if b['file'] == 'catpaw-editable-source-and-icons.zip')
    before = performance['before']
    after = performance['after']
    note = f'''# 启动提速与分享修复（建议版本1.0.1）

本轮只更新前端。后端palm-api、桥接、支付、商品、奖励及账户数据均未改动，不需要重新部署服务端。本次没有上传、提审、发布、真实付款或真实账户写操作。

## 修改内容

- 未登录时保留默认物品入口URL，但不初始化物品列表、照片观察或问候弹窗；等待原生onRouteDone事件后只跳转一次登录页，避免在启动路由尚未完成时重建页面栈。登录页仅保留欢迎展示、登录与必要按钮加载反馈。
- 三个原全局组件改为页面及组件的局部依赖；修复加载、反馈组件的标签选择器警告。登录猫咪仍使用兼容的无损透明PNG，原有254张PNG图片逐字节不变。
- 登录失效统一跳转，重复401不重复清除和重建页面；匿名登录旧响应不能覆盖切换后的新账户。到访与问候合并同一流程的重复读取，服务端日期、签到和发奖规则不变。
- 24个页面提供明确的好友分享内容。普通分享固定为公开介绍卡，落地物品入口；不会分享当前物品、账目、草稿或截图。未登录者正常进入登录页，已登录者看到自己的物品。
- 两种小报只有用户主动点击原有分享按钮时继续分享对应小报；右上角菜单分享公开介绍卡。喵铺邀请保留当前账户的有效邀请码，未就绪或切换账号时退回普通介绍卡。
- 新邀请封面800×640、5:4、21,970字节，放在喵铺分包，无分享时绘制或下载。保留可编辑SVG和原有猫咪矢量来源；聊天尺寸预览仅用于说明，不额外打包。

## 性能与验收结果

同一Windows微信开发者工具2.02.2609231、基础库3.17.3，隔离模拟数据，分别从默认物品入口本地重新编译5次。测量起点为应用脚本开始执行，终点为登录页onReady；不是完整下载、微信进程启动或真机云函数耗时。

| 本地模拟器登录页就绪 | 修改前 | 最终版 |
|---|---:|---:|
| 5次样本（毫秒） | {', '.join(map(str, before['login_ready_ms']))} | {', '.join(map(str, after['login_ready_ms']))} |
| 中位数 | {before['median_ms']}毫秒 | {after['median_ms']}毫秒 |
| 最慢样本 | {before['max_ms']}毫秒 | {after['max_ms']}毫秒 |
| 登录页出现前业务请求 | 每次0个 | 每次0个 |

中间方案仅等待onReady时仍有一次约10秒慢样本，记录保存在after-ready-native.json；最终改为等待原生路由完成后，5次样本未再出现该慢样本。样本较少，不能外推为所有手机的提速比例。

- 源码和正式构建模块各462/462项回归通过。覆盖并发401、跳转失败重试、旧登录响应、多账户隔离、24页分享、邀请归属、小报显式分享和到访请求合并。
- 24页原生WXML/WXSS及两个反馈组件共52项编译检查；24页分享返回与跨包导航检查。6个页面因隔离样例未提供单据资料而显示读取失败，验证了失败状态仍能分享；这些页面的正常操作由前端回归覆盖，不算作真实账户验收。具体页面见upload-manifest.json中的fixture_missing_routes。
- 源码、正式构建各72项登录页宽度与字号检查，各16项问候／容量组件布局检查，覆盖320、390、430、768宽度及放大字号。原生截图与离线布局图在“启动与分享验收”目录，均使用示例资料。
- 本轮隔离控制台未出现原有全局组件、组件标签选择器警告；原始webviewId报错未在隔离环境复现，已修复可确认的重复跳转路径，仍需手机多账号复测。
- 本轮没有重新运行代码质量面板扫描；不宣称历史主包1.5M、媒体总量200K建议已通过。开发者工具预加载提示如仍出现，单独看待，不通过屏蔽日志处理。

## 包体积和SHA256

源码主包1,432,449 → {build['sourcePackages']['mainBytes']:,}字节；正式主包1,354,374 → {build['builtPackages']['mainBytes']:,}字节，均低于1,450,000字节预算。完整项目包括10个分包，不能以完整ZIP或全项目总量代替主包体积。新增分享和路由代码使主包小幅增加，邀请图片留在分包。

- 前端：`catpaw-miniprogram.zip`（{front['bytes']:,}字节）
  SHA256：`{front['sha256']}`
- 可编辑源码及插画源文件：`catpaw-editable-source-and-icons.zip`
  SHA256：`{source['sha256']}`
- 后端及桥接SHA256与之前版本一致；本轮无需更新，完整列表见SHA256SUMS.txt。

## 中文更新步骤

1. 将catpaw-miniprogram.zip解压到一个新的空目录，再用微信开发者工具导入。不要覆盖旧目录，以免遗留旧组件或旧分包文件。
2. 保留正式AppID及现有云环境。包内DEV_LOGIN=false，API_TRANSPORT=cloud_http_function；无需增加request合法域名、环境变量、集合或索引。
3. 本地编译并手动检查登录、四个主栏目和子页返回。建议上传版本号1.0.1，备注：“优化首次打开与登录加载，修复好友分享，更新喵铺邀请卡片，完善账号切换与加载反馈。”
4. 用体验版分别在安卓、苹果上检查首次扫码、再次进入、退出重登、登录失效，以及连续进入子页后返回，确认只有一个玻璃导航栏。
5. 实际从右上角“发送给朋友”分享，确认卡片不含私人截图；从喵铺邀请并由新用户进入，确认图片、登录落地及邀请关系。转发本身不发奖励，新用户首次注册并保存首件物品后的奖励仍由服务器判定。
6. 抽查小报专用分享按钮、问候关闭、收藏册和签到；测试弱网与重试。真机首次下载时间、云函数冷启动及实际微信好友卡片显示由你确认，当前模拟器结果不代替这些检查。
7. 验收后由你手动提审和发布；只更新前端，palm-api及桥接保持原状。

## 继续开发与回溯

使用build-beauty-icons.cjs构建，再运行prepare-current-release.py打包。邀请图可用prepare-invitation-art.cjs重新生成；可编辑源文件位于branding/startup-share-20261020/invitation.svg。普通分享文案位于miniprogram/utils/share.js，喵铺邀请配置位于pages/rewards/lib/share.js。

修改前源码快照位于工作区test-results/startup-share-20261020/before；原90图标历史ZIP备份仍保留。目录内旧说明和旧截图为历史记录，当前前端包及校验值以本文件、upload-manifest.json及SHA256SUMS.txt为准。
'''
    (OUT / '启动提速与分享更新说明.md').write_text(note, encoding='utf-8')
    instructions = OUT / '中文更新步骤.md'
    old = instructions.read_text(encoding='utf-8')
    newest = '> 2026-10-20：当前为启动与分享修复版，建议版本1.0.1。请先阅读[启动提速与分享更新说明](启动提速与分享更新说明.md)；只更新前端，以下为历史说明。\n\n'
    if not old.startswith(newest):
        instructions.write_text(newest + old, encoding='utf-8')
    print(json.dumps({'routes': len(routes), 'front_sha256': front['sha256'], 'source_sha256': source['sha256'],
                      'source_main': build['sourcePackages']['mainBytes'], 'built_main': build['builtPackages']['mainBytes'],
                      'before_median_ms': before['median_ms'], 'after_median_ms': after['median_ms']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
