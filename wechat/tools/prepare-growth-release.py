"""Manual-only release; preserve dependencies, data, prices and historical bundles."""
import ast
import email
import hashlib
import importlib.util
import json
import re
import shutil
import zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
deploy=root/'deploy/cloudbase';out=deploy/'growth-20261018';evidence=root/'docs/images/growth-20261018'
out.mkdir(parents=True,exist_ok=True)
def log(name):
    raw=(root.parent/'test-results'/name).read_bytes()
    return raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8-sig')
js=log('growth-frontend.log');py=log('growth-backend.log')
assert 'fail 0' in js and py.rstrip().endswith('OK')
js_count=int(re.search(r'tests (\d+)',js).group(1));py_count=int(re.search(r'Ran (\d+) tests',py).group(1))
results={name:json.loads((evidence/name).read_text(encoding='utf-8-sig')) for name in ('layout-results.json','compile-results.json','native-results.json')}
assert all(r['passed'] for r in results.values())
spec=importlib.util.spec_from_file_location('release_builder',root/'tools/prepare-purchases-release.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder);builder.OUTPUT=out;builder.RELEASE='growth-20261018'
baseline=deploy/'rewards-20261017/palm-api-rewards-python310.zip'
sources=[(p,'palm/'+p.name) for p in sorted((root/'backend/palm').glob('*.py'))]
sources += [(root/'backend/cloudbase_probe'/n,'cloudbase_probe/'+n) for n in ('__init__.py','client.py')]
sources += [(deploy/'api'/n,n) for n in ('app.py','scf_bootstrap','requirements.txt')]
for p,name in sources:
    if name.endswith('.py'):ast.parse(p.read_text(encoding='utf-8'),filename=name,feature_version=(3,10))
with zipfile.ZipFile(baseline) as z:
    versions={}
    for n in z.namelist():
        if n.startswith('third_party/') and n.endswith('.dist-info/METADATA'):
            m=email.message_from_bytes(z.read(n));versions[m['Name'].lower().replace('_','-')]=m['Version']
    changed_api=[n for p,n in sources if n not in z.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=z.read(n).replace(b'\r\n',b'\n')]
for line in (deploy/'api/requirements.txt').read_text().splitlines():
    if line.strip() and not line.startswith('#'):
        name,version=line.split('==');assert versions[name.lower().replace('_','-')]==version
api=builder.build('palm-api-growth-python310.zip',baseline,'third_party/',sources)
bridge=builder.build('palm-api-bridge-growth-node20.zip',deploy/'rewards-20261017/palm-api-bridge-rewards-node20.zip','node_modules/',[(deploy/'bridge'/n,n) for n in ('index.js','package.json','package-lock.json')])
project=root/'miniprogram';config=json.loads((project/'project.config.json').read_text(encoding='utf-8'))
def match(name,r):
    return r['type']=='file' and name==r['value'] or r['type']=='folder' and name.startswith(r['value']+'/') or r['type']=='suffix' and name.endswith(r['value'])
def ignored(name):
    return any(match(name,r) for r in config['packOptions']['ignore']) and not any(match(name,r) for r in config['packOptions'].get('include',[]))
files={p.relative_to(project).as_posix():p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules','.git','__pycache__'})}
assert not any('qa-fixture' in n or 'api-original' in n for n in files)
with zipfile.ZipFile(deploy/'greeting-hd-20261018/catpaw-miniprogram.zip') as z:
    changed=[n for n,p in files.items() if n not in z.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=z.read(n).replace(b'\r\n',b'\n')]
    prior=sum(i.file_size for i in z.infolist())
    for name in ('assets/rewards/good-day.png','assets/rewards/good-night.png'):assert files[name].read_bytes()==z.read(name)
front=out/'catpaw-miniprogram.zip'
with zipfile.ZipFile(front,'w',zipfile.ZIP_DEFLATED) as z:
    for n,p in files.items():z.write(p,n)
with zipfile.ZipFile(front) as z:
    assert z.testzip() is None
    for n,p in files.items():assert z.read(n)==p.read_bytes()
    size=sum(i.file_size for i in z.infolist());assert size<2*1024*1024,size
digest=hashlib.sha256(front.read_bytes()).hexdigest();front.with_suffix('.zip.sha256').write_text(f'{digest}  {front.name}\n',encoding='utf-8')
manifest={'release':'growth-20261018','deployed':False,'cloud_writes':0,'real_payments':0,'frontend_tests':js_count,'backend_tests':py_count,'layout_checks':len(results['layout-results.json']['checks']),'wechat_compile_checks':len(results['compile-results.json']['checks']),'wechat_runtime_checks':len(results['native-results.json']['checks']),'real_device_verified':False,'python310_syntax_verified':True,'dependency_versions_verified':versions,'new_collections':[],'changed_frontend_files':changed,'changed_api_files':changed_api,'achievement_count':14,'achievement_total_seeds':810,'bundles':[{'file':front.name,'bytes':front.stat().st_size,'sha256':digest,'uncompressed_bytes':size,'net_added_bytes':size-prior,'remaining_below_2MiB':2*1024*1024-size},api,{**bridge,'optional_for_bridge_transport_only':True}]}
(out/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
prerequisites={'applied':False,'create_collections':[],'new_environment_variables':[],'indexes':[
    {'collection':'palm_member_documents','fields':['user_id','kind','_id'],'directions':[1,1,1],'reuse_existing':True},
    {'collection':'palm_ledger_entries','fields':['user_id','_id'],'directions':[1,1],'reuse_existing':True},
    {'collection':'palm_items','fields':['user_id','deleted_at','_id'],'directions':[1,1,1],'reuse_existing':True}],
    'preserve_existing_data_and_permissions':True,'backfill':'Lazy transaction initialization on first visit or relevant mutation; no manual migration.'}
(out/'database-prerequisites.json').write_text(json.dumps(prerequisites,ensure_ascii=False,indent=2),encoding='utf-8')
for n in results:shutil.copy2(evidence/n,out/n)
for n in ('growth-frontend.log','growth-backend.log'):shutil.copy2(root.parent/'test-results'/n,out/n)
shots=out/'验收截图';shots.mkdir(exist_ok=True)
for n in ('shop-top-390.png','growth-visits-390.png','growth-items-390.png','growth-ledger-390.png','growth-visits-320-large.png','membership-390.png','growth-claimed-native.png','growth-items-native.png','announcement-native.png','shop-native.png'):
    shutil.copy2(evidence/n,shots/n)
shutil.copy2(root/'docs/growth-api-20261018.md',out/'接口与数据说明.md')
shutil.copy2(root/'docs/design/growth-20261018/lossless-optimization.json',out/'图片无损压缩记录.json')
manual=f'''# 会员、递进签到与成长册更新步骤

本包仅供你手动更新。本轮未部署、发布、付款、接入广告，也未操作真实账户。

## 本次变化

- 删除会员入口、会员页和公告的初创优惠标签、截止时间及活动文案；公告保留感谢、持续完善和反馈入口，信封关闭动画不变。月会员和季会员售价、期限及已拥有购买限制不变。
- 无限容量改用独立的饱满猫咪物品箱图标，不改变其他场景的小猫。白天、夜间问候的高清修复保持原文件未变。
- 签到按本周第1—7次领取5、5、5、5、8、10、12喵粒；漏签后继续下一档，北京时间周一重置。本周旧记录按次数衔接，旧奖励不扣回、不补差。每日问候和两个签到按钮共用领取状态。
- 有效邀请改为100喵粒。已到账的120不变，更新后满足条件的邀请发100。
- 广告显示（0/3），每次＋10、每日最多3次；目前仍未开放，点击不扣次数、不发币。
- 喵铺最下方新增成长册，三类共14档（门槛表实际为4＋5＋5），全部奖励共810喵粒。每档达成后手动领取一次，免费与会员规则相同。

| 类别 | 门槛 | 对应喵粒 |
|---|---|---|
| 常来看看 | 3／7／30／90个不同日期 | 10／20／60／150 |
| 物品收藏 | 5／10／20／50／100件 | 10／20／40／80／120 |
| 认真记账 | 5／20／50／100／300笔 | 10／20／40／80／150 |

到访从新版开始记录；不按注册时间或“使用天数”推算过去登录。已有有效物品、有效手动收支计入对应成就。回收站、自动同步、退款、历史导入、关联重复项及批次回执不计入。数量记录最高进度，删除、编辑、恢复不重复累计；成就不自动发币，余额明细可查。

## 手动更新顺序

1. 先备份现有前端和云函数包。将catpaw-miniprogram.zip解压到新目录，用微信开发者工具导入；先在隔离测试环境预览本次截图和交互。
2. 查看database-prerequisites.json，只核对现有三个账户分页索引；缺失时按字段和顺序补齐。不要删除或重建已有集合，不改变现有权限。本次无需新集合、环境变量或批量迁移。
3. 前端准备并验收后，安排短时间更新窗口，将palm-api-growth-python310.zip上传到原palm-api，沿用现有Python3.10、支付、消息通知、补单和存储配置。本次无需上传palm-pay-notify。
4. 如果仍使用Node桥接传输，再同步更新palm-api-bridge-growth-node20.zip到原桥接函数，使新增到访和成就领取路径通过白名单。当前若为cloud_http_function直连方式，则不需要桥接包。
5. 确认后端已更新，再扫码预览新版前端并确认会员文案、签到递进、100喵粒邀请说明、广告0/3及成长册。随后由你上传、提审、发布小程序，缩短前后端版本不同的时间。
6. 使用自己的测试账号核对签到、重复领取与余额明细；历史余额、永久扩容和会员到期时间应不变。新前端依赖新增接口，请勿长期连接旧后端。无需手动修改余额、成就、签到或真实会员文档。

## 体积与校验

前端原始文件合计{size:,}字节，相比上一高清修复版净增{size-prior:,}字节，低于2MiB。新容量图标为210×210透明PNG、8,643字节；6张既有图片无损重新编码，解码后RGBA像素逐一相同，截图和高分辨率原稿不入包。ZIP及SHA-256均校验，校验值见同名.sha256及upload-manifest.json。

## 已完成验收与待真机确认

前端{js_count}项、后端{py_count}项回归通过；{len(results['layout-results.json']['checks'])}项离线布局检查、{len(results['compile-results.json']['checks'])}项微信模板／样式编译、{len(results['native-results.json']['checks'])}项隔离微信模拟器运行检查通过。覆盖四种宽度和放大字号、跨周漏签、旧记录衔接、重复提交、跨账户、并发、事务提交响应丢失、历史分页及成就资格。

模拟器使用本地测试替身；不代表已验证云端冷启动或手机真机。发布前请分别扫码检查安卓、苹果的显示、网络失败与重试。依赖复用上一已交付的固定Linux运行包，并验证Python3.10语法；本机测试并非Linux生产运行验证。
'''
(out/'中文更新步骤.md').write_text(manual,encoding='utf-8')
(out/'验收记录.md').write_text(f'# 验收记录\n\n前端{js_count}、后端{py_count}项通过；布局27项、微信编译8项、隔离运行10项通过。具体检查见本目录JSON与日志。未部署，未修改真实数据；真机需扫码确认。\n',encoding='utf-8')
print(json.dumps({k:manifest[k] for k in ('release','frontend_tests','backend_tests','layout_checks','wechat_compile_checks','wechat_runtime_checks')}))
print(json.dumps(manifest['bundles'][0]))
