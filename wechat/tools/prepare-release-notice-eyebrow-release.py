from pathlib import Path
import hashlib,json,shutil,zipfile
root=Path(__file__).resolve().parents[1]
project=root/'miniprogram'
prior=root/'deploy/cloudbase/release-notice-20261018'
out=root/'deploy/cloudbase/release-notice-eyebrow-20261018'
evidence=root/'docs/images/release-notice-eyebrow-20261018'
out.mkdir(parents=True,exist_ok=True)
changed=['pages/items/header.wxss','templates/item-list.wxml']
for n in ('layout-results.json','compile-results.json'):
 r=json.loads((evidence/n).read_text(encoding='utf-8-sig'));assert r['passed']
raw=(root.parent/'test-results/release-notice-eyebrow-frontend.log').read_bytes()
log=raw.decode('utf-16' if raw.startswith(b"\xff\xfe") else 'utf-8-sig')
assert 'pass 419' in log and 'fail 0' in log
bundle=out/'catpaw-miniprogram.zip'
with zipfile.ZipFile(prior/'catpaw-miniprogram.zip') as old,zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as new:
 for entry in old.infolist():
  n=entry.filename
  content=(project/n).read_bytes()
  assert n in changed or content==old.read(n),n
  new.writestr(n,content)
with zipfile.ZipFile(bundle) as z:
 assert z.testzip() is None
 size=sum(e.file_size for e in z.infolist());assert size<2*1024*1024
 assert all(z.read(n)==(project/n).read_bytes() for n in z.namelist())
digest=hashlib.sha256(bundle.read_bytes()).hexdigest()
bundle.with_suffix('.zip.sha256').write_text(digest+'  '+bundle.name+'\n',encoding='utf-8')
manifest={'release':out.name,'baseline':prior.name,'changed_files':changed,'sha256':digest,'bytes':bundle.stat().st_size,'uncompressed_bytes':size,'frontend_tests':419,'layout_checks':33,'compile_checks':8,'native_runtime_repeated':False,'deployed':False,'api_unchanged':True}
(out/'upload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
for n in ('layout-results.json','compile-results.json'):shutil.copy2(evidence/n,out/n)
shutil.copy2(root.parent/'test-results/release-notice-eyebrow-frontend.log',out/'frontend-tests.log')
shots=out/'截图';shots.mkdir(exist_ok=True)
for n in ('items-unread-390.png','items-open-390.png','items-unread-320-large.png'):shutil.copy2(evidence/n,shots/n)
manual=(prior/'中文更新说明.md').read_text(encoding='utf-8')
manual=manual.replace('“物品”的“我的物品”右侧新增','“物品”的“生活收藏册”小字右侧显示')
start=manual.index('## 验收与体积')
manual=manual[:start]+f"""## 本次位置微调及验证

小猫信封由“我的物品”标题右侧移到“生活收藏册”小字右侧。44px点击区域、未读提示、公告内容、账户记忆及关闭动画全部保留；会员公告未修改。

本次重新运行419项前端回归、33项布局检查（含320／390／430／768及放大字号）、8项微信模板与样式编译，全部通过。截图来自隔离数据的实际页面模板。公告行为沿用上一版已通过的微信模拟器验收，本次位置微调未重复运行原生交互检查，手机真机仍需扫码确认。

这是完整的新前端包，仅两个前端布局文件相对上一包有变化。包内文件逐一与当前源文件核对一致，CRC与SHA-256通过，原始文件合计{size:,}字节，低于2MiB。仅需更新前端，无需更新palm-api，没有自动部署或修改真实数据。
"""
(out/'中文更新说明.md').write_text(manual,encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False))
