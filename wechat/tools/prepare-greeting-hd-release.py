"""Package only the verified greeting illustration update; no deployment."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

root=Path(__file__).resolve().parents[1]
project=root/'miniprogram'
out=root/'deploy/cloudbase/greeting-hd-20261018'
evidence=root/'docs/images/greeting-hd-20261018'
out.mkdir(parents=True,exist_ok=True)
config=json.loads((project/'project.config.json').read_text(encoding='utf-8'))
def match(name,r):
    return r['type']=='file' and name==r['value'] or r['type']=='folder' and name.startswith(r['value']+'/') or r['type']=='suffix' and name.endswith(r['value'])
def ignored(name):
    return any(match(name,r) for r in config['packOptions']['ignore']) and not any(match(name,r) for r in config['packOptions'].get('include',[]))
sources={p.relative_to(project).as_posix():p for p in sorted(project.rglob('*')) if p.is_file() and not ignored(p.relative_to(project).as_posix()) and not p.name.startswith('project.private') and not set(p.parts).intersection({'node_modules','.git','__pycache__'})}
with zipfile.ZipFile(root/'deploy/cloudbase/rewards-20261017/catpaw-miniprogram.zip') as archive:
    changed=[n for n,p in sources.items() if n not in archive.namelist() or p.read_bytes().replace(b'\r\n',b'\n')!=archive.read(n).replace(b'\r\n',b'\n')]
    assert not set(archive.namelist())-set(sources)
    prior=sum(i.file_size for i in archive.infolist())
assert set(changed)=={'assets/rewards/good-day.png','assets/rewards/good-night.png','utils/rewards.js'},changed
results=json.loads((evidence/'results.json').read_text(encoding='utf-8'))
assert results['passed'] and len(results['checks'])==24
data=(root.parent/'test-results/greeting-hd-js.log').read_bytes()
log=data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig')
assert 'pass 400' in log and 'fail 0' in log
bundle=out/'catpaw-miniprogram.zip'
with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as archive:
    for name,p in sources.items():archive.write(p,name)
with zipfile.ZipFile(bundle) as archive:
    assert archive.testzip() is None
    for name,p in sources.items():assert archive.read(name)==p.read_bytes()
    size=sum(i.file_size for i in archive.infolist());assert size<2*1024*1024
digest=hashlib.sha256(bundle.read_bytes()).hexdigest()
bundle.with_suffix('.zip.sha256').write_text(f'{digest}  {bundle.name}\n',encoding='utf-8')
manifest={'release':'greeting-hd-20261018','deployed':False,'api_unchanged':True,'cloud_writes':0,'frontend_tests':400,'layout_checks':24,'real_device_verified':False,'changed_frontend_files':changed,'bundles':[{'file':bundle.name,'sha256':digest,'bytes':bundle.stat().st_size,'uncompressed_bytes':size,'net_added_bytes':size-prior,'remaining_below_2MiB':2*1024*1024-size,'source_files':len(sources)}],'assets':results['assets']}
(out/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copy2(evidence/'results.json',out/'验收结果.json')
shutil.copy2(evidence/'清晰度对比.png',out/'清晰度对比.png')
shutil.copy2(root.parent/'test-results/greeting-hd-js.log',out/'frontend-tests.log')
manual=f'''# 猫咪问候插画清晰度修复

白天问候不再放大51×49像素的小图标，改用单独重绘的384×368透明图片；夜间插画从原图重新导出为510×340，适配高密度屏幕。保持现有角色风格和弹窗布局。白天旧图标被其他页面共用，继续保留，不影响它们。

两张运行图片合计29,201字节；相比旧版增加10,302字节（约10.1KiB）。整个前端原始文件变化{size-prior:+,}字节，合计{size:,}字节，仍低于2MiB。高分辨率原稿、试验素材和验收截图均未打入小程序包。PNG采用调色板压缩，保留透明背景，不加载远程大图。

## 更新步骤

1. 将本目录catpaw-miniprogram.zip解压到新目录，用微信开发者工具导入。
2. 编译并扫码预览，每日问候的白天／夜间图可参考本目录清晰度对比.png。日常展示规则和已展示记录没有更改，不会强制重弹当天已读问候。
3. 确认后按原流程上传、提审及发布。本次只更新前端；palm-api、通知函数、数据库、环境变量均无需更改。
4. ZIP校验值见同名.sha256和upload-manifest.json。历史部署包仍保留，可用于回退。

## 验收

400项前端回归通过；24项离线真实模板渲染检查通过，覆盖320／390／430／768、放大字号及2倍／3倍屏幕密度，两张图均无缺失、无溢出，关闭按钮保持至少44px。透明背景和图片尺寸已检查；包内文件逐一与源码一致，ZIP CRC及SHA-256已校验。

本次未改WXML／WXSS，未重复执行微信模板编译；未声称完成手机真机验收，请扫码确认实际屏幕。未部署、发布、付款或修改云端数据。生成方式、原稿与提示词见wechat/docs/design/greeting-hd-20261018/生成记录.md。
'''
(out/'中文更新说明.md').write_text(manual,encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
