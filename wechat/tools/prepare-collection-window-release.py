"""Frontend-only release; assert server and all unrelated runtime files are unchanged."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

root=Path(__file__).resolve().parents[1]
project=root/'miniprogram';baseline=root/'deploy/cloudbase/growth-20261018'
out=root/'deploy/cloudbase/collection-window-20261018';evidence=root/'docs/images/collection-window-20261018'
out.mkdir(parents=True,exist_ok=True)
config=json.loads((project/'project.config.json').read_text(encoding='utf-8'))
def match(name,r):
    return r['type']=='file' and name==r['value'] or r['type']=='folder' and name.startswith(r['value']+'/') or r['type']=='suffix' and name.endswith(r['value'])
def ignored(name):
    return any(match(name,r) for r in config['packOptions']['ignore']) and not any(match(name,r) for r in config['packOptions'].get('include',[]))
sources={p.relative_to(project).as_posix():p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules','.git','__pycache__'})}
with zipfile.ZipFile(baseline/'catpaw-miniprogram.zip') as z:
    changed=[n for n,p in sources.items() if n not in z.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=z.read(n).replace(b'\r\n',b'\n')]
    assert not set(z.namelist())-set(sources)
    prior=sum(i.file_size for i in z.infolist())
assert set(changed)=={'pages/rewards/index.js','pages/rewards/index.wxml','pages/rewards/index.wxss','assets/membership/books.png','assets/membership/budget.png'},changed
with zipfile.ZipFile(baseline/'palm-api-growth-python310.zip') as z:
    for p in (root/'backend/palm').glob('*.py'):assert p.read_bytes().replace(b'\r\n',b'\n')==z.read('palm/'+p.name)
with zipfile.ZipFile(baseline/'palm-api-bridge-growth-node20.zip') as z:
    assert (root/'deploy/cloudbase/bridge/index.js').read_bytes().replace(b'\r\n',b'\n')==z.read('index.js')
raw=(root.parent/'test-results/collection-window-frontend.log').read_bytes()
log=raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')
tests=int(re.search(r'tests (\d+)',log).group(1));assert 'fail 0' in log and f'pass {tests}' in log
results={n:json.loads((evidence/n).read_text(encoding='utf-8-sig')) for n in ('layout-results.json','compile-results.json','native-results.json')}
assert all(r['passed'] for r in results.values())
bundle=out/'catpaw-miniprogram.zip'
with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as z:
    for n,p in sources.items():z.write(p,n)
with zipfile.ZipFile(bundle) as z:
    assert z.testzip() is None
    for n,p in sources.items():assert z.read(n)==p.read_bytes()
    size=sum(i.file_size for i in z.infolist());assert size<2*1024*1024,size
    assert not any('qa-fixture' in n or 'api-original' in n for n in z.namelist())
digest=hashlib.sha256(bundle.read_bytes()).hexdigest()
bundle.with_suffix('.zip.sha256').write_text(f'{digest}  {bundle.name}\n',encoding='utf-8')
manifest={'release':'collection-window-20261018','deployed':False,'api_unchanged':True,'cloud_writes':0,'real_payments':0,'real_device_verified':False,'frontend_tests':tests,'layout_checks':len(results['layout-results.json']['checks']),'wechat_compile_checks':len(results['compile-results.json']['checks']),'wechat_runtime_checks':len(results['native-results.json']['checks']),'changed_frontend_files':changed,'bundles':[{'file':bundle.name,'bytes':bundle.stat().st_size,'sha256':digest,'uncompressed_bytes':size,'net_added_bytes':size-prior,'remaining_below_2MiB':2*1024*1024-size,'source_files':len(sources)}]}
(out/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
for n in results:shutil.copy2(evidence/n,out/n)
shutil.copy2(evidence/'lossless-optimization.json',out/'图片无损压缩记录.json')
shutil.copy2(root.parent/'test-results/collection-window-frontend.log',out/'frontend-tests.log')
shots=out/'验收截图';shots.mkdir(exist_ok=True)
for n in ('entry-390.png','window-visits-ready-390.png','window-items-ready-390.png','window-items-ready-320-large.png','window-visits-error-390.png','entry-native.png','window-native.png','scrolled-native.png','error-native.png'):
    shutil.copy2(evidence/n,shots/n)
manual=f'''# 猫爪收藏册紧凑入口更新

本次仅更新前端，不需要重新上传palm-api、桥接或通知函数，也没有新增数据库集合、索引或环境变量。未自动部署、发布、付款或修改真实账户。

## 页面变化

原来铺在页面底部的成长册卡片，改成“每日小任务”下方、“喵的小铺”上方的一行“猫爪收藏册”入口。整行约56px可点击，有待领取奖励时显示“X项可领取”；无奖励时只保留箭头，外面不展示分类和进度。

点击打开暖白圆角窗口。固定标题、右上关闭按钮和常来看看／物品收藏／认真记账分栏；列表独立滚动，包含已领取、可领取及未达成的完整成就。窗口最高约80%屏幕，关闭恢复原页面位置；同页重开记住分类，离开页面或切换账号后重置。

打开先显示已有记录，再刷新；刷新失败在窗口内重试，原进度保留。领取时防重复提交，关闭不取消提交，完成后更新余额和入口提示，不自动重开窗口。窗口与兑换、明细及问候互斥，账号切换隔离旧响应。14档门槛、810喵粒、签到、邀请、广告、会员和支付规则全部沿用上一版。

## 手动更新

1. 保留现有包作为备份，将本目录catpaw-miniprogram.zip解压到新目录，用微信开发者工具导入。
2. 编译并扫码检查入口位置、弹窗打开关闭、分类、列表滚动和原页面位置。安卓及苹果手机的实际表现请各自确认。
3. 确认后按原流程手动上传、提审并发布。沿用上一轮已更新的成长册后端，不需要为本次重复上传云函数或调整真实数据。
4. SHA-256见同名.sha256与upload-manifest.json；截图、验收记录不需要打进上传包。

## 验收与包体

前端{tests}项回归通过；布局{manifest['layout_checks']}项、微信模板／样式编译{manifest['wechat_compile_checks']}项、隔离微信运行{manifest['wechat_runtime_checks']}项通过。覆盖320／390／430／768与放大字号、完整成就、固定标题、窗口内滚动、页面位置恢复、重复领取、提交中关闭、失败重试及账号切换。

仅账本、预算两张既有图标做无损PNG重新编码，解码后RGBA像素与上一版完全一致，没有新插画。前端原始文件合计{size:,}字节，较上一版{size-prior:+,}字节，低于2MiB；包内每个文件与源文件一致，ZIP CRC及SHA-256均已校验。

服务端源码和桥接源码逐一与上一交付包比对一致，因此没有重复运行后端回归。本轮模拟器使用独立离线测试替身，不代表已经完成手机真机测试或生产环境验收。
'''
(out/'中文更新说明.md').write_text(manual,encoding='utf-8')
(out/'验收记录.md').write_text(f'# 验收记录\n\n前端{tests}项、布局{manifest["layout_checks"]}项、微信编译{manifest["wechat_compile_checks"]}项、隔离微信运行{manifest["wechat_runtime_checks"]}项全部通过。明细见本目录JSON与日志。未部署；真机请扫码确认。\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
