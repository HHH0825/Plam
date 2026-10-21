"""Build manual-only rewards release with pinned dependencies from prior delivery."""
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
deploy=root/'deploy/cloudbase'
out=deploy/'rewards-20261017'
evidence=root/'docs/images/rewards-20261017'
out.mkdir(parents=True,exist_ok=True)

def read_log(name):
    data=(root.parent/'test-results'/name).read_bytes()
    return data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')

js=read_log('rewards-frontend.log');py=read_log('rewards-backend.log')
assert 'fail 0' in js and py.rstrip().endswith('OK')
js_count=int(re.search(r'tests (\d+)',js).group(1));py_count=int(re.search(r'Ran (\d+) tests',py).group(1))
results={name:json.loads((evidence/name).read_text(encoding='utf-8-sig')) for name in ('layout-results.json','compile-results.json','native-results.json')}
assert all(v['passed'] for v in results.values())
spec=importlib.util.spec_from_file_location('release_builder',root/'tools/prepare-purchases-release.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
builder.OUTPUT=out;builder.RELEASE='rewards-20261017'
baseline=deploy/'member-announcement-20261017/palm-api-member-announcement-python310.zip'
sources=[(p,'palm/'+p.name) for p in sorted((root/'backend/palm').glob('*.py'))]
sources += [(root/'backend/cloudbase_probe'/n,'cloudbase_probe/'+n) for n in ('__init__.py','client.py')]
sources += [(deploy/'api'/n,n) for n in ('app.py','scf_bootstrap','requirements.txt')]
for p,name in sources:
    if name.endswith('.py'):ast.parse(p.read_text(encoding='utf-8'),filename=name,feature_version=(3,10))
with zipfile.ZipFile(baseline) as z:
    versions={}
    for name in z.namelist():
        if name.startswith('third_party/') and name.endswith('.dist-info/METADATA'):
            m=email.message_from_bytes(z.read(name));versions[m['Name'].lower().replace('_','-')]=m['Version']
for line in (deploy/'api/requirements.txt').read_text().splitlines():
    if line.strip() and not line.startswith('#'):
        name,version=line.split('==');assert versions[name.lower().replace('_','-')]==version
api=builder.build('palm-api-rewards-python310.zip',baseline,'third_party/',sources)
bridge=builder.build('palm-api-bridge-rewards-node20.zip',deploy/'palm-api-bridge-node20.zip','node_modules/',[(deploy/'bridge'/n,n) for n in ('index.js','package.json','package-lock.json')])
project=root/'miniprogram';config=json.loads((project/'project.config.json').read_text(encoding='utf-8'))
def match(name,r):
    return r['type']=='file' and name==r['value'] or r['type']=='folder' and name.startswith(r['value']+'/') or r['type']=='suffix' and name.endswith(r['value'])
def ignored(name):
    return any(match(name,r) for r in config['packOptions']['ignore']) and not any(match(name,r) for r in config['packOptions'].get('include',[]))
files={p.relative_to(project).as_posix():p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules','.git','__pycache__'})}
assert not any('qa-fixture' in n or 'api-original' in n for n in files)
front=out/'catpaw-miniprogram.zip'
with zipfile.ZipFile(front,'w',zipfile.ZIP_DEFLATED) as z:
    for name,p in files.items():z.write(p,name)
with zipfile.ZipFile(front) as z:
    assert z.testzip() is None
    for name,p in files.items():assert z.read(name)==p.read_bytes()
    size=sum(i.file_size for i in z.infolist());assert size<2*1024*1024,size
digest=hashlib.sha256(front.read_bytes()).hexdigest();front.with_suffix('.zip.sha256').write_text(f'{digest}  {front.name}\n',encoding='utf-8')
with zipfile.ZipFile(deploy/'member-horizontal-20261017/catpaw-miniprogram.zip') as z:
    changed_front=[name for name,p in files.items() if name not in z.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=z.read(name).replace(b'\r\n',b'\n')]
with zipfile.ZipFile(baseline) as z:
    changed_api=[name for p,name in sources if name not in z.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=z.read(name).replace(b'\r\n',b'\n')]
prerequisites={'applied':False,'create_collections':[], 'indexes':[
    {'collection':'palm_items','name':'capacity_owner_deleted_page','unique':False,'fields':['user_id','deleted_at','_id'],'directions':[1,1,1],'create_only_if_missing':True},
    {'collection':'palm_member_documents','name':'owner_kind_id','unique':False,'fields':['user_id','kind','_id'],'directions':[1,1,1],'reuse_existing':True}],
    'new_environment_variables':[], 'preserve_existing_data_and_permissions':True}
(out/'database-prerequisites.json').write_text(json.dumps(prerequisites,ensure_ascii=False,indent=2),encoding='utf-8')
bundles=[{'file':front.name,'bytes':front.stat().st_size,'uncompressed_bytes':size,'sha256':digest},api,{**bridge,'optional':True}]
manifest={'release':'rewards-20261017','deployed':False,'cloud_writes':0,'real_payments':0,'real_device_verified':False,'frontend_tests':js_count,'backend_tests':py_count,'layout_checks':len(results['layout-results.json']['checks']),'wechat_compile_checks':len(results['compile-results.json']['checks']),'wechat_runtime_checks':len(results['native-results.json']['checks']),'python310_syntax_verified':True,'linux_runtime_executed':False,'dependency_versions_verified':versions,'new_collections':[],'bundles':bundles,'changed_frontend_files':changed_front,'changed_api_files':changed_api,'frontend_sources':{n:hashlib.sha256(p.read_bytes()).hexdigest() for n,p in files.items()}}
(out/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
for name in results:shutil.copy2(evidence/name,out/name)
for name in ('rewards-backend.log','rewards-frontend.log'):shutil.copy2(root.parent/'test-results'/name,out/name)
shutil.copy2(root/'docs/rewards-manual-20261017.md',out/'中文更新步骤.md')
screens=out/'验收截图';screens.mkdir(exist_ok=True)
for name in ('shop-top-390.png','shop-capacity-390.png','greeting-390.png','capacity-390.png','shop-exchange-390.png','shop-ready-320-large.png','shop-native.png','greeting-native.png','me-native.png','loading-animation.gif'):
    shutil.copy2(evidence/name,screens/name)
if (evidence/'效果预览.png').exists():shutil.copy2(evidence/'效果预览.png',out/'效果预览.png')
report=f'''# 签到喵铺更新验收记录

- 前端回归：{js_count}项通过；后端回归：{py_count}项通过（SQLite及隔离事务文档服务）。
- 实际WXML／WXSS浏览器布局：{manifest['layout_checks']}项通过，覆盖320／390／430／768宽度及放大字号。
- 微信开发者工具模板和样式编译：{manifest['wechat_compile_checks']}项通过；独立离线小程序运行交互：{manifest['wechat_runtime_checks']}项通过。
- 覆盖签到跨日跨周、账号隔离、余额不足、兑换五档边界、重复提交、并发创建／签到／兑换、丢失提交响应、旧账户超过100件计数、回收站恢复、会员到期与永久容量保留。
- 展示原图、运行PNG和真实页面渲染截图分别保存；加载动图由运行CSS动画逐帧截图生成，不是静态草图冒充动画。
- 前端包解压 {size:,}字节，小于2 MiB；ZIP读取校验和源文件逐项一致；后端Python 3.10语法及既有Linux依赖版本核对通过。
- 本次未在Linux云运行环境执行、未使用真实安卓／苹果手机验收；微信分享→新用户真实登录的端到端链路仍需按中文步骤真机确认。隔离文档服务不能替代真实云平台性能验收。
- 未自动部署、发布、付款、发放真实奖励或更改真实数据；支付通知与补单包无须更新。
'''
(out/'验收记录.md').write_text(report,encoding='utf-8');(root/'docs/rewards-acceptance-20261017.md').write_text(report,encoding='utf-8')
print(json.dumps({k:manifest[k] for k in ('release','frontend_tests','backend_tests','layout_checks','wechat_compile_checks','wechat_runtime_checks')}))
print(json.dumps([{'file':b['file'],'sha256':b['sha256'],'bytes':b['bytes']} for b in bundles]))
