"""Package the notice icon and identity colours; no cloud operations."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

root=Path(__file__).resolve().parents[1]
project=root/'miniprogram'
baseline=root/'deploy/cloudbase/member-announcement-20261017'
output=root/'deploy/cloudbase/member-notice-icon-20261017'
evidence=root/'docs/images/member-notice-icon-20261017'
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
assert changed==['assets/membership/announcement.png','pages/membership/index.wxml','pages/membership/index.wxss'],changed
with zipfile.ZipFile(baseline/'palm-api-member-announcement-python310.zip') as archive:
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
data=(root.parent/'test-results/member-notice-icon-js.log').read_bytes();log=data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
tests=int(re.search(r'tests (\d+)',log).group(1));assert 'fail 0' in log and f'pass {tests}' in log
results={}
for n in ('layout-results.json','compile-results.json','native-results.json'):
    results[n]=json.loads((evidence/n).read_text(encoding='utf-8-sig'));assert results[n]['passed'];shutil.copy2(evidence/n,output/n)
shots=output/'验收截图';shots.mkdir(exist_ok=True)
for n in ('free-native.png','active-native.png','active-320-large.png','closed-390.png'):
    shutil.copy2(evidence/n,shots/n)
shutil.copy2(root/'docs/images/member-announcement-20261017/closed-native.png',shots/'调整前-公告按钮.png')
shutil.copy2(root.parent/'test-results/member-notice-icon-js.log',output/'member-notice-icon-js.log')
manifest={'release':'member-notice-icon-20261017','deployed':False,'api_unchanged':True,'cloud_writes':0,'real_payments':0,'frontend_tests':tests,'changed_frontend_files':changed,'bundles':[{'file':path.name,'sha256':digest,'bytes':path.stat().st_size,'uncompressed_bytes':size,'source_files':len(sources),'net_added_bytes':size-prior_size}],'icon_bytes':(project/'assets/membership/announcement.png').stat().st_size,'real_device_verified':False}
(output/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
manual='''# 公告小图标与金色身份标签

本次只更新小程序前端，不需要再次上传 palm-api，也不需要修改商品、环境变量或数据库。

- 公告换成“猫咪抱金色信件”的小图标，紧跟“多一点从容”右侧；点击仍打开原公告弹窗，首次自动弹出及账号已读记忆保持原样。图标显示32px，点击区域44px，透明PNG为120×120，约3.7KB。
- 有效会员的“猫爪会员 · 已开通”改为浅金色渐变、金色描边和棕金文字；免费与到期状态仍使用原样式。
- 小屏或放大字号时标题可以换行，但图标始终跟随“多一点从容”，不另占身份信息下方一行。

## 你需要操作

1. 备份现有前端，将 catpaw-miniprogram.zip 解压到新文件夹，用微信开发者工具导入，保持原AppID和云环境。
2. 编译并扫码预览：图标紧跟标题，点它打开公告；已有会员显示金色身份条，到期日不变。安卓、苹果分别确认触摸和放大字号。
3. 验收后由你上传、提审和发布。本次没有自动发布。

本包包含上一轮公告与年会员停售的完整前端。如果上一轮后端尚未更新，仍需按上一轮中文说明更新对应 palm-api、停售年商品并在新API生效后删除年商品配置；本轮没有新增后端步骤。

SHA-256见同名 .sha256 和 upload-manifest.json。验收截图、日志、图标源文件均不需要上传；可编辑SVG留在工程 branding/member-notice-icon-20261017，未重复打包。需要回退本次样式时，恢复上一轮前端即可。
'''
report=f'''# 验收记录

- 前端 {tests} 项回归通过；微信WXML／WXSS编译 {len(results['compile-results.json']['checks'])} 项通过。
- 布局 {len(results['layout-results.json']['checks'])} 项通过：320／390／430／768及320、390放大字号，检查标题末端图标、44px点击区域、会员金色状态及原公告各状态。
- 离线微信运行 {len(results['native-results.json']['checks'])} 项通过，验证小图标打开公告、免费及已开通状态，截图已人工检查。
- 前端 {len(sources)} 个文件逐一与源文件匹配，解压 {size:,} 字节，较上一轮增加 {size-prior_size:,} 字节；透明PNG {manifest['icon_bytes']:,} 字节。
- 后端运行源码与上一轮逐一比对相同，不交付重复API包；支付与会员期限没有变化。
- 未部署、付款或修改真实数据；安卓与苹果真机仍由用户扫码确认。
'''
for n,c in [('中文操作说明.md',manual),('验收记录.md',report)]: (output/n).write_text(c,encoding='utf-8')
for n,c in [('member-notice-icon-manual-20261017.md',manual),('member-notice-icon-acceptance-20261017.md',report)]: (root/'docs'/n).write_text(c,encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
