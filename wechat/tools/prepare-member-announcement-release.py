"""Prepare a manual-only release; no cloud credentials or business data are read."""
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
output=deploy/'member-announcement-20261017'
evidence=root/'docs/images/member-announcement-20261017'
output.mkdir(parents=True,exist_ok=True)

def log(name):
    data=(root.parent/'test-results'/name).read_bytes()
    return data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')

js_log=log('member-announcement-js.log');python_log=log('member-announcement-python.log')
js_tests=int(re.search(r'tests (\d+)',js_log).group(1))
python_tests=int(re.search(r'Ran (\d+) tests',python_log).group(1))
assert 'fail 0' in js_log and f'pass {js_tests}' in js_log and python_log.rstrip().endswith('OK')
spec=importlib.util.spec_from_file_location('builder',root/'tools/prepare-purchases-release.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
builder.OUTPUT=output;builder.RELEASE='member-announcement-20261017'
baseline=deploy/'compact-tools-20261017/palm-api-compact-tools-python310.zip'
sources=[(p,'palm/'+p.name) for p in sorted((root/'backend/palm').glob('*.py'))]
sources += [(root/'backend/cloudbase_probe'/n,'cloudbase_probe/'+n) for n in ('__init__.py','client.py')]
sources += [(deploy/'api'/n,n) for n in ('app.py','scf_bootstrap','requirements.txt')]
for p,n in sources:
    if n.endswith('.py'):ast.parse(p.read_text(encoding='utf-8'),filename=n,feature_version=(3,10))
with zipfile.ZipFile(baseline) as archive:
    versions={}
    for n in archive.namelist():
        if n.startswith('third_party/') and n.endswith('.dist-info/METADATA'):
            m=email.message_from_bytes(archive.read(n));versions[m['Name'].lower().replace('_','-')]=m['Version']
for line in (deploy/'api/requirements.txt').read_text().splitlines():
    if line.strip() and not line.startswith('#'):
        name,version=line.split('==');assert versions[name.lower().replace('_','-')]==version
api=builder.build('palm-api-member-announcement-python310.zip',baseline,'third_party/',sources)
with zipfile.ZipFile(baseline) as before,zipfile.ZipFile(output/api['file']) as after:
    changed_api=[n for p,n in sources if before.read(n).replace(b'\r\n',b'\n')!=after.read(n)]
    assert changed_api==['palm/__init__.py','palm/membership.py','palm/payments.py'],changed_api
    for p,n in sources:assert after.read(n)==p.read_bytes().replace(b'\r\n',b'\n')

project=root/'miniprogram';config=json.loads((project/'project.config.json').read_text(encoding='utf-8'))
def match(name,rule):
    return rule['type']=='file' and name==rule['value'] or rule['type']=='folder' and name.startswith(rule['value']+'/') or rule['type']=='suffix' and name.endswith(rule['value'])
def ignored(name):
    return any(match(name,r) for r in config['packOptions']['ignore']) and not any(match(name,r) for r in config['packOptions'].get('include',[]))
front_sources={p.relative_to(project).as_posix():p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules','.git','__pycache__'})}
with zipfile.ZipFile(deploy/'member-letter-20261017/catpaw-miniprogram.zip') as before:
    changed_front=[n for n,p in front_sources.items() if n not in before.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=before.read(n).replace(b'\r\n',b'\n')]
    removed_front=sorted(set(before.namelist())-set(front_sources));assert not removed_front
    prior_size=sum(i.file_size for i in before.infolist())
assert changed_front==['pages/membership/index.js','pages/membership/index.wxml','pages/membership/index.wxss','utils/member-announcement.js','utils/member-benefits.js'],changed_front
front_path=output/'catpaw-miniprogram.zip'
with zipfile.ZipFile(front_path,'w',zipfile.ZIP_DEFLATED) as archive:
    for n,p in front_sources.items():archive.write(p,n)
with zipfile.ZipFile(front_path) as archive:
    assert archive.testzip() is None
    for n,p in front_sources.items():assert archive.read(n)==p.read_bytes()
    assert not any('qa-fixture' in n or 'project.private' in n or '..' in Path(n).parts for n in archive.namelist())
    assert b'qaNoticeLayout' not in archive.read('pages/membership/index.js')
    assert b'member-letter-stage' not in archive.read('pages/membership/index.wxml')
    size=sum(i.file_size for i in archive.infolist());assert size<2*1024*1024
digest=hashlib.sha256(front_path.read_bytes()).hexdigest()
front_path.with_suffix('.zip.sha256').write_text(f'{digest}  {front_path.name}\n',encoding='utf-8')
front={'file':front_path.name,'bytes':front_path.stat().st_size,'sha256':digest,'source_files':len(front_sources),'uncompressed_bytes':size,'net_added_bytes':size-prior_size}
results={}
for n in ('layout-results.json','compile-results.json','native-results.json','package-audit.json'):
    results[n]=json.loads((evidence/n).read_text(encoding='utf-8-sig'))
    if n!='package-audit.json':assert results[n]['passed']
    shutil.copy2(evidence/n,output/n)
audit=results['package-audit.json']
# The static scanner also counts local IDE preferences and nested Git metadata;
# the release deliberately excludes both from upload.
local_only=sum(p.stat().st_size for p in project.rglob('*') if p.is_file()
               and not ignored(p.relative_to(project).as_posix())
               and p.relative_to(project).as_posix() not in front_sources)
assert audit['includedRawBytes']==size+local_only
audit.update(actualPackagedRawBytes=size,localPreferencesAndMetadataExcludedBytes=local_only)
(output/'package-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
for n in ('member-announcement-js.log','member-announcement-python.log'):shutil.copy2(root.parent/'test-results'/n,output/n)
shutil.copy2(deploy/'api/env.example.json',output/'palm-api-env.example.json')
shutil.copy2(root/'tools/check-payment-config.py',output/'check-payment-config.py')
assert 'PRODUCT_YEAR' not in (output/'palm-api-env.example.json').read_text(encoding='utf-8')
shots=output/'验收截图';shots.mkdir(exist_ok=True)
for n in ('open-native.png','closed-native.png','active-native.png','after-offer-native.png','error-native.png','open-320-large.png','closed-390.png'):
    shutil.copy2(evidence/n,shots/n)
shutil.copy2(root/'docs/images/member-letter-20261017/open-native.png',shots/'调整前-留言气泡.png')
manifest={'release':builder.RELEASE,'deployed':False,'cloud_writes':0,'real_payments':0,'bundles':[api,front],'changed_api_files':changed_api,'changed_frontend_files':changed_front,'create_collections':[],'add_indexes':[],'frontend_tests':js_tests,'backend_tests':python_tests,'python310_syntax_verified':True,'linux_runtime_executed':False,'dependency_versions_verified':versions,'real_device_verified':False,'manual_remove_env':['PALM_PAY_PRODUCT_YEAR','PALM_PAY_IOS_PRODUCT_YEAR'],'retired_products':['catpaw_vip_year','catpaw_ios_year'],'existing_rights_preserved':True,'admin_twelve_month_gift_preserved':True}
(output/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
report=f'''# 公告与年会员停售验收记录

- 前端回归 {js_tests} 项通过：公告明确关闭才记住、账号与环境隔离、存储失败、本次会话不重复提示、手动重开、旧响应隔离、两端价格及购买限制。
- 后端回归 {python_tests} 项通过：SQLite与模拟CloudBase事务覆盖月季目录、缺年商品配置仍可开放、年套餐410拒绝且不下单／不调用微信、历史两端年订单快照发货／去重／退款、已有赠送及退款交错。
- 布局 {len(results['layout-results.json']['checks'])} 项通过：320／390／430／768、320和390放大字号，覆盖展开、关闭、免费、有效、到期、活动结束、读取失败和暂未开放。
- 微信WXML／WXSS编译 {len(results['compile-results.json']['checks'])} 项通过；离线微信运行 {len(results['native-results.json']['checks'])} 项通过，包括首次公告、关闭后不自动重开、手动重开、账号隔离、滚动位置保持与活动结束。没有调用真实付款接口。
- 前端 {len(front_sources)} 个文件与源码逐一核对，解压 {size:,} 字节，较上一版 {size-prior_size:+,} 字节；没有新增图片。API只有列明的3个运行文件变化，固定Linux依赖、Python3.10语法、启动脚本权限、ZIP完整性及SHA-256已校验。
- 维护者12个月赠送保留，不变更真实用户期限；不执行数据库迁移、不批量修改历史记录。
- 尚未在真实Linux云函数中运行，也未替代安卓、苹果真机触摸／反馈／付款验收；未部署、停售云端商品、发起付款或修改真实会员。
'''
(root/'docs/member-announcement-acceptance-20261017.md').write_text(report,encoding='utf-8')
(output/'验收记录.md').write_text(report,encoding='utf-8')
shutil.copy2(root/'docs/member-announcement-manual-20261017.md',output/'中文操作说明.md')
print(json.dumps({'output':str(output),'frontend':front,'api':{k:api[k] for k in ('file','bytes','sha256')},'frontend_tests':js_tests,'backend_tests':python_tests},ensure_ascii=False))
