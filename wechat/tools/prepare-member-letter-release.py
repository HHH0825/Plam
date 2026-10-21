"""Package the membership letter UI only; never uploads or writes business data."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

root=Path(__file__).resolve().parents[1]
project=root/'miniprogram'
output=root/'deploy/cloudbase/member-letter-20261017'
evidence=root/'docs/images/member-letter-20261017'
output.mkdir(parents=True,exist_ok=True)
config=json.loads((project/'project.config.json').read_text(encoding='utf-8'))
def match(name,rule):
    return rule['type']=='file' and name==rule['value'] or rule['type']=='folder' and name.startswith(rule['value']+'/') or rule['type']=='suffix' and name.endswith(rule['value'])
def ignored(name):
    return any(match(name,r) for r in config['packOptions']['ignore']) and not any(match(name,r) for r in config['packOptions'].get('include',[]))
sources={p.relative_to(project).as_posix():p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules','.git','__pycache__'})}
baseline=root/'deploy/cloudbase/compact-tools-20261017'
with zipfile.ZipFile(baseline/'catpaw-miniprogram.zip') as before:
    assert set(sources)==set(before.namelist())
    changed=[n for n,p in sources.items() if p.read_bytes().replace(b'\r\n',b'\n')!=before.read(n).replace(b'\r\n',b'\n')]
    prior_size=sum(i.file_size for i in before.infolist())
assert changed==['pages/membership/index.js','pages/membership/index.wxml','pages/membership/index.wxss'],changed
api_sources=[(p,'palm/'+p.name) for p in (root/'backend/palm').glob('*.py')]
api_sources += [(root/'backend/cloudbase_probe'/n,'cloudbase_probe/'+n) for n in ('__init__.py','client.py')]
api_sources += [(root/'deploy/cloudbase/api'/n,n) for n in ('app.py','scf_bootstrap','requirements.txt')]
with zipfile.ZipFile(baseline/'palm-api-compact-tools-python310.zip') as archive:
    for p,n in api_sources:assert p.read_bytes().replace(b'\r\n',b'\n')==archive.read(n),n
bundle=output/'catpaw-miniprogram.zip'
with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as archive:
    for n,p in sources.items():archive.write(p,n)
with zipfile.ZipFile(bundle) as archive:
    assert archive.testzip() is None
    for n,p in sources.items():assert archive.read(n)==p.read_bytes()
    assert b'qaLetterLayout' not in archive.read('pages/membership/index.js')
    assert b'member-startup-note' not in archive.read('pages/membership/index.wxml')
    size=sum(i.file_size for i in archive.infolist())
assert size<2*1024*1024
digest=hashlib.sha256(bundle.read_bytes()).hexdigest()
(output/'catpaw-miniprogram.zip.sha256').write_text(f'{digest}  {bundle.name}\n',encoding='utf-8')
data=(root.parent/'test-results/member-letter-js.log').read_bytes()
log=data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
tests=int(re.search(r'tests (\d+)',log).group(1));assert 'fail 0' in log and f'pass {tests}' in log
results={}
for n in ('layout-results.json','compile-results.json','native-results.json','package-audit.json'):
    results[n]=json.loads((evidence/n).read_text(encoding='utf-8-sig'))
    if n!='package-audit.json':assert results[n]['passed']
    shutil.copy2(evidence/n,output/n)
shutil.copy2(root.parent/'test-results/member-letter-js.log',output/'member-letter-js.log')
shots=output/'验收截图';shots.mkdir(exist_ok=True)
for n in ('open-native.png','closed-native.png','active-native.png','after-offer-native.png','error-native.png','open-320-large.png','closed-390.png'):
    shutil.copy2(evidence/n,shots/n)
shutil.copy2(root/'docs/images/free-appearance-20261017/membership-native.png',shots/'调整前-membership-native.png')
manifest={'release':'member-letter-20261017','deployed':False,'cloud_writes':0,'real_payments':0,'api_unchanged':True,'changed_frontend_files':changed,'frontend_tests':tests,'bundles':[{'file':bundle.name,'sha256':digest,'bytes':bundle.stat().st_size,'source_files':len(sources),'uncompressed_bytes':size,'net_added_bytes':size-prior_size}]}
(output/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
manual='''# 会员页留言气泡：中文更新步骤

本轮只更新小程序前端，palm-api、通知函数、环境变量及数据库均不需要改动。没有自动上传、发布或修改真实数据。

## 调整内容

- 原来套餐下方的大段说明卡片移到猫咪左侧，变为“写给你的话”留言气泡，首次进入默认展开。
- 气泡正文在固定小窗中上下滚动，完整文案仍读取现有服务端内容；反馈入口固定在窗底，继续打开原微信反馈。
- 点右上角减号收起，留下小型“写给你的话＋”入口；再点可展开。气泡在页面正常布局内，收起后套餐自动上移，不覆盖金额或购买按钮。
- 当前页面保留收放选择；新打开会员页或切换账号时默认展开。活动结束后不显示过期特惠正文，仍可阅读当前反馈说明；读取失败时不显示旧账号或旧状态内容。
- 套餐、实际售价、会员有效期、“已拥有”限制、订单核对及支付逻辑保持原样。

## 你需要操作

1. 保存目前的小程序工程以便回退。
2. 将 catpaw-miniprogram.zip 解压到新的文件夹，在微信开发者工具导入含 app.json 和 project.config.json 的目录，保持原 AppID。
3. 编译后扫码预览：默认展开时，小窗在猫咪左侧，正文可以上下滑动；点减号后变成小入口，套餐向上移动，再点恢复。
4. 检查微信反馈入口、免费／已开通会员状态、购买记录等原有功能。安卓、苹果分别确认滚动、放大字号及触摸体验。
5. 确认后由你上传体验版、提审及发布。本轮无需再次上传 palm-api 或 palm-pay-notify。

本包基于上一轮“工具折叠、会员入口与贴纸精简”的完整前端。如果尚未完成上一轮后端更新，请先按上一轮说明配齐其 palm-api；本轮没有新增后端变更。

校验值见 catpaw-miniprogram.zip.sha256 与 upload-manifest.json；“验收截图”包含展开、收起及调整前对比图。需要回退时只恢复上一轮前端，不必回退云函数。
'''
report=f'''# 验收记录

- 前端回归 {tests} 项通过，覆盖默认展开、当前页面保留状态、账号切换清理、活动结束及原两端价格／购买限制回归。
- 布局 {len(results['layout-results.json']['checks'])} 项通过：320／390／430／768宽度及320放大字号，覆盖展开、收起、免费、到期、活动结束、加载与失败状态。
- 微信模板／样式编译 {len(results['compile-results.json']['checks'])} 项通过；离线微信运行 {len(results['native-results.json']['checks'])} 项通过，确认正文可滚动、气泡在猫咪左侧、收起后套餐上移。
- 前端389个文件与源码逐一一致，解压合计 {size:,} 字节，较上一轮变化 {size-prior_size:+,} 字节；没有新增图片。
- 仅会员页JS、WXML、WXSS三处运行文件变化；API全部运行源与上一轮包一致，不交付重复云函数包。
- 未部署、付款或修改真实账户数据。安卓、苹果真机滚动与触摸仍由用户扫码确认。
'''
for name,content in [('中文操作说明.md',manual),('验收记录.md',report)]:
    (output/name).write_text(content,encoding='utf-8')
for name,content in [('member-letter-manual-20261017.md',manual),('member-letter-acceptance-20261017.md',report)]:
    (root/'docs'/name).write_text(content,encoding='utf-8')
print(json.dumps({'output':str(output),**manifest['bundles'][0]},ensure_ascii=False))
