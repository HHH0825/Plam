"""Package the notice icon and identity colours; no cloud operations."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

root=Path(__file__).resolve().parents[1]
project=root/'miniprogram'
baseline=root/'deploy/cloudbase/member-letter-flight-20261017'
output=root/'deploy/cloudbase/member-horizontal-20261017'
evidence=root/'docs/images/member-horizontal-20261017'
output.mkdir(parents=True,exist_ok=True)
config=json.loads((project/'project.config.json').read_text(encoding='utf-8'))
def match(name,rule):
    return rule['type']=='file' and name==rule['value'] or rule['type']=='folder' and name.startswith(rule['value']+'/') or rule['type']=='suffix' and name.endswith(rule['value'])
def ignored(name):
    return any(match(name,r) for r in config['packOptions']['ignore']) and not any(match(name,r) for r in config['packOptions'].get('include',[]))
sources={p.relative_to(project).as_posix():p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules','.git','__pycache__'})}
with zipfile.ZipFile(baseline/'catpaw-miniprogram.zip') as archive:
    changed=[n for n,p in sources.items() if n not in archive.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=archive.read(n).replace(b'\r\n',b'\n')]
    assert not set(archive.namelist())-set(sources)
    prior_size=sum(i.file_size for i in archive.infolist())
assert changed==['pages/me/index.wxml','pages/me/index.wxss'],changed
with zipfile.ZipFile(root/'deploy/cloudbase/member-announcement-20261017/palm-api-member-announcement-python310.zip') as archive:
    for p in (root/'backend/palm').glob('*.py'):
        assert archive.read('palm/'+p.name)==p.read_bytes().replace(b'\r\n',b'\n')
path=output/'catpaw-miniprogram.zip'
with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as archive:
    for n,p in sources.items():archive.write(p,n)
with zipfile.ZipFile(path) as archive:
    assert archive.testzip() is None
    for n,p in sources.items():assert archive.read(n)==p.read_bytes()
    size=sum(i.file_size for i in archive.infolist());assert size<2*1024*1024
    assert b'qaNoticeLayout' not in archive.read('pages/membership/index.js')
    assert not any('qa-fixture' in n for n in archive.namelist())
digest=hashlib.sha256(path.read_bytes()).hexdigest()
path.with_suffix('.zip.sha256').write_text(f'{digest}  {path.name}\n',encoding='utf-8')
data=(root.parent/'test-results/member-horizontal-js.log').read_bytes();log=data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
tests=int(re.search(r'tests (\d+)',log).group(1));assert 'fail 0' in log and f'pass {tests}' in log
results={}
for n in ('layout-results.json','compile-results.json'):
    results[n]=json.loads((evidence/n).read_text(encoding='utf-8-sig'));assert results[n]['passed'];shutil.copy2(evidence/n,output/n)
shots=output/'验收截图';shots.mkdir(exist_ok=True)
for n in ('active-390.png','free-390.png','expired-390.png','error-390.png','active-320-large.png'):
    shutil.copy2(evidence/n,shots/Path(n).name)
shutil.copy2(root.parent/'test-results/member-horizontal-js.log',output/'member-horizontal-js.log')
manifest={'release':'member-horizontal-20261017','deployed':False,'api_unchanged':True,'cloud_writes':0,'real_payments':0,'frontend_tests':tests,'changed_frontend_files':changed,'bundles':[{'file':path.name,'sha256':digest,'bytes':path.stat().st_size,'uncompressed_bytes':size,'source_files':len(sources),'net_added_bytes':size-prior_size}],'real_device_verified':False}
(output/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
manual='''# 恢复横向会员卡

已按要求取消卷轴方案，删除该方案专用的猫咪图片、收放逻辑、状态记忆、样式、测试及验收副本。昵称下的小身份条也不再显示。

“猫爪会员”恢复为早期的横向卡片，位于账户概览下方、“我的收藏册”上方。已开通使用猫咪抱票券插画和暖金色卡面，显示真实到期日；免费、到期、读取失败等原有状态继续保留。卡片仍进入原会员页。

本次只需将 catpaw-miniprogram.zip 解压到新目录，用微信开发者工具导入、编译并扫码预览，确认后再由你上传、提审、发布。不需要更新云函数、修改支付配置或清理会员数据。本次未自动部署或发布。

会员页公告、独立信封收回动画、月季套餐及之前完成的功能保持当前已交付版本。SHA-256见同名 .sha256 与 upload-manifest.json；验收截图无需打包上传。
'''
report=f'''# 恢复横向会员卡验收

- 前端 {tests} 项回归通过，横向卡片 {len(results['layout-results.json']['checks'])} 项布局检查通过，微信模板／样式编译 {len(results['compile-results.json']['checks'])} 项通过。
- 覆盖320／390／430／768及放大字号，检查免费、有效、到期、读取中、失败、暂未开放和长昵称；卡片位于概览与收藏册之间。
- 相比上一份已交付前端，仅“我的”WXML和WXSS变化；JS、会员页、支付及后端运行源均保持原已交付版本。
- 卷轴专用运行文件与资源已删除，没有新的图片或会员数据写入。
- 包内 {len(sources)} 个文件与源文件逐一一致，解压 {size:,} 字节，变化 {size-prior_size:+,} 字节；ZIP及SHA-256已校验。
- 本轮没有重复执行原微信运行回归，未部署或发布；手机实际显示仍可扫码确认。
'''
for n,c in [('中文操作说明.md',manual),('验收记录.md',report)]: (output/n).write_text(c,encoding='utf-8')
for n,c in [('member-horizontal-manual-20261017.md',manual),('member-horizontal-acceptance-20261017.md',report)]: (root/'docs'/n).write_text(c,encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
