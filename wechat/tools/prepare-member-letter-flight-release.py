"""Package the notice icon and identity colours; no cloud operations."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

root=Path(__file__).resolve().parents[1]
project=root/'miniprogram'
baseline=root/'deploy/cloudbase/member-notice-motion-20261017'
output=root/'deploy/cloudbase/member-letter-flight-20261017'
evidence=root/'docs/images/member-letter-flight-20261017'
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
assert changed==['assets/membership/letter.png','pages/membership/index.wxml'],changed
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
data=(root.parent/'test-results/member-letter-flight-js.log').read_bytes();log=data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
tests=int(re.search(r'tests (\d+)',log).group(1));assert 'fail 0' in log and f'pass {tests}' in log
results={}
for n in ('layout-results.json','compile-results.json'):
    results[n]=json.loads((evidence/n).read_text(encoding='utf-8-sig'));assert results[n]['passed'];shutil.copy2(evidence/n,output/n)
shots=output/'验收截图';shots.mkdir(exist_ok=True)
for n in ('motion-frames/frame-250.png','open-320-large.png','closed-390.png'):
    shutil.copy2(evidence/n,shots/Path(n).name)
shutil.copy2(root/'docs/images/member-notice-motion-20261017/motion-frames/frame-250.png',shots/'调整前-重复猫咪图案.png')
shutil.copy2(root.parent/'test-results/member-letter-flight-js.log',output/'member-letter-flight-js.log')
manifest={'release':'member-letter-flight-20261017','deployed':False,'api_unchanged':True,'cloud_writes':0,'real_payments':0,'frontend_tests':tests,'changed_frontend_files':changed,'bundles':[{'file':path.name,'sha256':digest,'bytes':path.stat().st_size,'uncompressed_bytes':size,'source_files':len(sources),'net_added_bytes':size-prior_size}],'flight_asset_bytes':(project/'assets/membership/letter.png').stat().st_size,'real_device_verified':False}
(output/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copy2(evidence/'notice-close-preview.gif',output/'关闭动画预览.gif')
manual='''# 飞行信封图案更新

本次只修改飞行时的图案：留言关闭后变成独立的金色信封，带一张小信纸和爱心封印，再收回标题旁的猫咪信封图标。固定入口图标、紧凑布局、飞行路线、速度、回弹及已读记忆保持原样。

1. 备份当前前端，将 catpaw-miniprogram.zip 解压到新文件夹，在微信开发者工具导入，保持原AppID和云环境。
2. 编译并扫码预览，打开公告后分别用叉号和“我知道了”关闭，确认飘过去的是独立信封，终点仍是标题猫咪图标。
3. 安卓、苹果真机确认后，由你上传、提审和发布。本次无需重新上传 palm-api、修改支付配置或数据库，也未自动发布。

SHA-256见同名 .sha256 及 upload-manifest.json。关闭动画预览.gif是实际WXML／WXSS在本地浏览器中的渲染，截图和日志不需要打包上传。图案SVG源文件保存在 branding/member-letter-flight-20261017，未重复打包。
'''
report=f'''# 飞行信封验收记录

- 前端 {tests} 项回归通过，布局及动画定格帧 {len(results['layout-results.json']['checks'])} 项通过，微信WXML／WXSS编译 {len(results['compile-results.json']['checks'])} 项通过。
- 包内只有飞行信封PNG及会员页WXML两处变化；已确认飞行图片与固定入口使用不同资源，所有图片可以读取、动画落点正常。PNG为120×120透明图，{manifest['flight_asset_bytes']:,}字节。
- 动画JS、样式和生命周期逻辑与上一轮逐字节相同，本轮未重复运行原微信动画行为验收；已人工检查更新后的定格帧并提供动图。安卓、苹果真机仍需用户扫码确认。
- 包内 {len(sources)} 个文件与源码逐一一致，解压 {size:,} 字节，净增 {size-prior_size:,} 字节；ZIP完整性、SHA-256和2MiB限制已校验。
- 后端源码与前次API包保持一致；没有部署、发布、付款或修改真实数据。
'''
for n,c in [('中文操作说明.md',manual),('验收记录.md',report)]: (output/n).write_text(c,encoding='utf-8')
for n,c in [('member-letter-flight-manual-20261017.md',manual),('member-letter-flight-acceptance-20261017.md',report)]: (root/'docs'/n).write_text(c,encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
