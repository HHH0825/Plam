"""Package the notice icon and identity colours; no cloud operations."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

root=Path(__file__).resolve().parents[1]
project=root/'miniprogram'
baseline=root/'deploy/cloudbase/member-notice-icon-20261017'
output=root/'deploy/cloudbase/member-notice-motion-20261017'
evidence=root/'docs/images/member-notice-motion-20261017'
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
assert changed==['pages/membership/index.js','pages/membership/index.wxml','pages/membership/index.wxss','utils/member-announcement-motion.js'],changed
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
data=(root.parent/'test-results/member-notice-motion-js.log').read_bytes();log=data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
tests=int(re.search(r'tests (\d+)',log).group(1));assert 'fail 0' in log and f'pass {tests}' in log
results={}
for n in ('layout-results.json','compile-results.json','native-results.json'):
    results[n]=json.loads((evidence/n).read_text(encoding='utf-8-sig'));assert results[n]['passed'];shutil.copy2(evidence/n,output/n)
shots=output/'验收截图';shots.mkdir(exist_ok=True)
for n in ('open-native.png','closed-native.png','open-320-large.png','closed-390.png'):
    shutil.copy2(evidence/n,shots/n)
shutil.copy2(root/'docs/images/member-announcement-20261017/closed-native.png',shots/'调整前-公告按钮.png')
shutil.copy2(root.parent/'test-results/member-notice-motion-js.log',output/'member-notice-motion-js.log')
manifest={'release':'member-notice-motion-20261017','deployed':False,'api_unchanged':True,'cloud_writes':0,'real_payments':0,'frontend_tests':tests,'changed_frontend_files':changed,'bundles':[{'file':path.name,'sha256':digest,'bytes':path.stat().st_size,'uncompressed_bytes':size,'source_files':len(sources),'net_added_bytes':size-prior_size}],'icon_bytes':(project/'assets/membership/announcement.png').stat().st_size,'real_device_verified':False}
(output/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copy2(evidence/'notice-close-preview.gif',output/'关闭动画预览.gif')
manual='''# 公告关闭动画：前端更新步骤

本次只更新小程序前端，不更换云函数、商品配置或数据库。右侧猫咪同步上移，介绍区与月／季套餐之间的留白收紧，放大字号时仍可自然撑开以免遮挡。

## 效果

点击公告的关闭叉号或“我知道了”，留言先折起并淡出，变成一封小信，再沿轻微弧线飞回标题右侧的猫咪信封图标。收回过程约0.56秒，随后图标轻轻弹一下，提示公告可以从这里重新查看。

动画使用真实图标位置计算落点，适配不同宽度和放大字号；不改变原页面滚动位置。图标不在屏幕内、无法测量位置或测量超时时，会直接关闭而不强行滚动页面。减少动态效果的系统偏好下，使用简短淡出。

关闭中重复点击不触发多次动画。账号切换、离开页面会清理动画定时器；已明确点击关闭才保存本机已读，失败或旧账号回调不会记到另一个账户。首次进入与手动重开规则保持不变。

## 你需要操作

1. 备份原前端，将 catpaw-miniprogram.zip 解压到新文件夹，在微信开发者工具导入，保持原AppID和云环境。
2. 编译并扫码预览，点标题信封打开公告，再分别点击叉号和“我知道了”，确认都能收回图标。连续点击、切后台再返回时不应卡住或重复弹窗。
3. 安卓与苹果分别确认动画、放大字号及返回后的正常点击；电脑模拟器不能代替两端真机验收。
4. 验收后由你上传、提审和发布。无需再次上传 palm-api；本次没有自动发布。

如果前面的年会员停售API还没更新，仍需按那一轮说明完成，不因本次动画包而省略。SHA-256见同名 .sha256 和 upload-manifest.json。动图、截图及日志是验收材料，不上传进小程序。回退本次动画只需恢复上一轮前端，不涉及会员和订单数据。
'''
report=f'''# 公告关闭动画验收记录

- 前端 {tests} 项回归通过；微信WXML／WXSS编译 {len(results['compile-results.json']['checks'])} 项通过。
- 布局 {len(results['layout-results.json']['checks'])} 项通过：320／390／430／768及320、390放大字号，检查标题图标、金色身份、原公告各状态及收回动画落点。
- 离线微信运行 {len(results['native-results.json']['checks'])} 项通过，验证动画中途实际位移、关闭后回弹和再次打开；定格帧已人工检查，动图为实际WXML／WXSS的本地浏览器渲染。
- 前端 {len(sources)} 个文件逐一与源文件匹配，解压 {size:,} 字节，较上一轮增加 {size-prior_size:,} 字节；复用原信封图标，未新增图片。
- 后端运行源码与上一轮逐一比对相同，不交付重复API包；支付与会员期限没有变化。
- 未部署、付款或修改真实数据；安卓与苹果真机仍由用户扫码确认。
'''
for n,c in [('中文操作说明.md',manual),('验收记录.md',report)]: (output/n).write_text(c,encoding='utf-8')
for n,c in [('member-notice-motion-manual-20261017.md',manual),('member-notice-motion-acceptance-20261017.md',report)]: (root/'docs'/n).write_text(c,encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
