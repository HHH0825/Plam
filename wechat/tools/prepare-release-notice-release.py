"""Frontend notice release, with explicit removal and unchanged backend checks."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

root=Path(__file__).resolve().parents[1];project=root/'miniprogram'
deploy=root/'deploy/cloudbase';baseline=deploy/'collection-window-20261018'
out=deploy/'release-notice-20261018';evidence=root/'docs/images/release-notice-20261018'
out.mkdir(parents=True,exist_ok=True)
config=json.loads((project/'project.config.json').read_text(encoding='utf-8'))
def match(n,r):
    return r['type']=='file' and n==r['value'] or r['type']=='folder' and n.startswith(r['value']+'/') or r['type']=='suffix' and n.endswith(r['value'])
def ignored(n):
    return any(match(n,r) for r in config['packOptions']['ignore']) and not any(match(n,r) for r in config['packOptions'].get('include',[]))
files={p.relative_to(project).as_posix():p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules','.git','__pycache__'})}
with zipfile.ZipFile(baseline/'catpaw-miniprogram.zip') as z:
    changed=[n for n,p in files.items() if n not in z.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=z.read(n).replace(b'\r\n',b'\n')]
    deleted=sorted(set(z.namelist())-set(files));prior=sum(i.file_size for i in z.infolist())
expected={'app.json','project.config.json','styles/announcement.wxss','templates/item-list.wxml','utils/member-announcement-motion.js','utils/release-notice-content.js','utils/release-notice.js','pages/items/header.wxss','pages/items/index.js','pages/items/index.wxml','pages/items/index.wxss','pages/me/index.js','pages/me/index.wxml','pages/membership/index.wxml','pages/membership/index.wxss'}
assert set(changed)==expected,changed
assert set(deleted)=={'assets/white-doodle/compact-support.png','assets/white-doodle/support.png',*[f'pages/support/index.{ext}' for ext in ('js','json','wxml','wxss')]},deleted
with zipfile.ZipFile(deploy/'growth-20261018/palm-api-growth-python310.zip') as z:
    for p in (root/'backend/palm').glob('*.py'):assert p.read_bytes().replace(b'\r\n',b'\n')==z.read('palm/'+p.name)
with zipfile.ZipFile(deploy/'growth-20261018/palm-api-bridge-growth-node20.zip') as z:assert (deploy/'bridge/index.js').read_bytes().replace(b'\r\n',b'\n')==z.read('index.js')
raw=(root.parent/'test-results/release-notice-frontend.log').read_bytes();log=raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')
tests=int(re.search(r'tests (\d+)',log).group(1));assert 'fail 0' in log and f'pass {tests}' in log
results={n:json.loads((evidence/n).read_text(encoding='utf-8-sig')) for n in ('layout-results.json','compile-results.json','native-results.json')};assert all(v['passed'] for v in results.values())
bundle=out/'catpaw-miniprogram.zip'
with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as z:
    for n,p in files.items():z.write(p,n)
with zipfile.ZipFile(bundle) as z:
    assert z.testzip() is None
    for n,p in files.items():assert z.read(n)==p.read_bytes()
    size=sum(i.file_size for i in z.infolist());assert size<2*1024*1024,size
    assert not any('qa-fixture' in n or 'api-original' in n for n in z.namelist())
    assert 'offline-release-notice' not in z.read('utils/release-notice-content.js').decode()
digest=hashlib.sha256(bundle.read_bytes()).hexdigest();bundle.with_suffix('.zip.sha256').write_text(f'{digest}  {bundle.name}\n',encoding='utf-8')
manifest={'release':'release-notice-20261018','deployed':False,'api_unchanged':True,'cloud_writes':0,'real_payments':0,'real_device_verified':False,'frontend_tests':tests,'layout_checks':len(results['layout-results.json']['checks']),'wechat_compile_checks':len(results['compile-results.json']['checks']),'wechat_runtime_checks':len(results['native-results.json']['checks']),'changed_frontend_files':changed,'removed_frontend_files':deleted,'notice_config':'utils/release-notice-content.js','bundles':[{'file':bundle.name,'bytes':bundle.stat().st_size,'sha256':digest,'uncompressed_bytes':size,'net_added_bytes':size-prior,'remaining_below_2MiB':2*1024*1024-size,'source_files':len(files)}]}
(out/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
for n in results:shutil.copy2(evidence/n,out/n)
shutil.copy2(root.parent/'test-results/release-notice-frontend.log',out/'frontend-tests.log')
shots=out/'验收截图';shots.mkdir(exist_ok=True)
for n in ('items-unread-390.png','items-read-390.png','items-open-390.png','items-unread-320-large.png','items-long-390.png','me-390.png','unread-native.png','announcement-native.png','read-native.png','me-native.png','member-announcement-390.png'):shutil.copy2(evidence/n,shots/n)
manual=f'''# 更新公告与“支持作者”入口精简

本次仅更新前端，无需上传palm-api、桥接或通知函数；数据库、索引、环境变量、支付和会员规则均不变。没有自动部署、发布或修改真实账户。

## 本次变化

“我的”删除支持作者入口、专用页面、路由和专用图标；反馈与建议、共用猫咪图片继续保留。

“物品”的“我的物品”右侧新增与会员页同款的小猫信封，未读时带暖橙色“！”。只有手动成功打开正文后才消除未读提示，不会自动弹出。已读后仍能再次查看；已处置档案页不显示入口。

公告窗口为暖白底、浅金边框，右上关闭固定可见，正文可滚动，底部提供反馈与建议和我知道了。关闭时信封收回实际图标；图标在屏幕外、测量失败或减少动态效果时采用安全回退。会员公告维持原来的触发、关闭及已读规则。

已读标记按服务环境＋稳定用户ID＋公告编号保存在本机，与会员公告分开；不存登录凭证或公告正文。换账号独立记录，换手机或清理缓存会再次显示“！”。存储失败时本次会话仍能记住已读。公告与每日问候、物品筛选和其他弹窗互斥；关闭不改变原页面位置。

## 手动更新小程序

1. 保留现有包作为备份。将本目录catpaw-miniprogram.zip解压到一个新目录，再用微信开发者工具导入。请使用完整的新目录，避免旧支持作者文件残留在工作目录。
2. 编译并扫码查看物品页信封、未读提示、正文、关闭动画，以及“我的”菜单。安卓和苹果请分别确认真实手机显示。
3. 确认后按原流程手动上传、提审和发布。无需为本次重复上传云函数或修改真实数据。
4. 校验值见同名.zip.sha256及upload-manifest.json。验收截图和说明文件不需要上传进小程序。

## 以后怎样更换公告

只需编辑解压目录下的 **utils/release-notice-content.js**。项目中的对应文件位于wechat/miniprogram/utils/release-notice-content.js。

- `id`：公告编号。每次要提醒用户阅读新内容时都换一个，例如从first-release-v1改成release-20261101-v1；只改正文、不改编号，已经读过的人不会重新出现“！”。编号是内部标识，不会替你修改微信后台的小程序版本号。
- `title`：窗口标题。
- `paragraphs`：正文段落，一段一条。保留英文单引号和逗号，中文内容直接写在引号内。

例如下一次发布可替换为：

```js
module.exports={{
  id:'release-20261101-v1',
  title:'猫爪更新小信',
  paragraphs:[
    '这次更新完善了几处记录体验，感谢你一直陪伴。',
    '在这里写本次实际完成的变化。',
    '如果遇到问题，欢迎通过“反馈与建议”告诉我。'
  ]
}}
```

保存后重新编译、扫码检查，再上传、提审、发布。公告随前端版本生效，不会在修改本地文件后直接推送给旧版本用户。首版仅展示当前公告，不提供历史公告列表。

## 验收与体积

前端{tests}项回归通过；布局{manifest['layout_checks']}项、微信模板／样式编译{manifest['wechat_compile_checks']}项、隔离微信模拟器{manifest['wechat_runtime_checks']}项检查通过。覆盖320／390／430／768、放大字号、未读与已读、长正文、图标失败回退、账号与环境隔离、更换公告编号、缓存失败、弹窗互斥、信封关闭及非零滚动位置恢复。

包内{len(files)}个文件与源文件逐一一致，ZIP CRC及SHA-256已校验；原始文件合计{size:,}字节，较上一版{size-prior:+,}字节，仍低于2MiB。复用现有信封及猫咪图片，没有新增大图片。后端源码及桥接源码与上一交付包逐一比对未变化，没有重复运行后端回归。

模拟器使用完全隔离的本地测试替身，未访问生产账户；本轮没有声称完成手机真机或生产环境验收。
'''
(out/'中文更新说明.md').write_text(manual,encoding='utf-8')
(out/'验收记录.md').write_text(f'# 验收记录\n\n前端{tests}项、布局{manifest["layout_checks"]}项、微信编译{manifest["wechat_compile_checks"]}项、隔离运行{manifest["wechat_runtime_checks"]}项通过。明细见本目录JSON与日志。未部署；真机请扫码确认。\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
