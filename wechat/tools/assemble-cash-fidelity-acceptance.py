"""Build honest comparisons at one scale; never stretch implementation to fit art."""
from pathlib import Path
import json, hashlib, shutil
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
out = root/'wechat/docs/images/cash-fidelity-20261014'
refs = root/'wechat/docs/images/cash-redesign-20261014'
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 13)
specs = [
    ('ledger', '记账看板', 'approved-ledger-me.png', (118,186,625,616),390/525),
    ('me', '个人概览', 'approved-ledger-me.png', (699,367,1195,659),390/525),
    ('statistics', '统计分类卡片', 'approved-statistics-report.png', (136,697,597,967),390/482),
    ('ledger-report', '收支小报', 'approved-statistics-report.png', (678,58,1224,1078),354/546),
]
metrics=[]
for name,label,source,crop,scale in specs:
    ref=Image.open(refs/source).convert('RGB').crop(crop)
    ref=ref.resize((round(ref.width*scale),round(ref.height*scale)), Image.Resampling.LANCZOS)
    current=Image.open(out/(name+'-component-browser.png')).convert('RGB')
    ref.save(out/(name+'-reference-normalized.png'))
    w=max(ref.width,current.width);h=max(ref.height,current.height)
    a=Image.new('RGB',(w,h),'white');a.paste(ref,(0,0))
    b=Image.new('RGB',(w,h),'white');b.paste(current,(0,0))
    overlay=Image.blend(a,b,.5)
    sheet=Image.new('RGB',(w*3+48,h+75),'#f3f1e9');draw=ImageDraw.Draw(sheet)
    draw.text((12,8),label+' · 390px 内容区对照（当前为本地渲染，非新微信截图）',font=font,fill='#333333')
    for i,(im,title) in enumerate([(a,'确认草图'),(b,'当前本地组件'),(overlay,'50% 叠加 · 左上对齐')]):
        x=12+i*(w+12);draw.text((x,37),title,font=small,fill='#555555');sheet.paste(im,(x,65))
    sheet.save(out/(name+'-comparison.png'))
    geometry=json.loads((out/(name+'-geometry-browser.json')).read_text('utf8'))['box']
    metrics.append({'area':name,'referenceWidth':round((crop[2]-crop[0])*scale,2),'referenceHeight':round((crop[3]-crop[1])*scale,2),'currentWidth':geometry['width'],'currentHeight':geometry['height'],'heightDelta':round(geometry['height']-(crop[3]-crop[1])*scale,2)})

browser=json.loads((out/'browser-results.json').read_text('utf8'))
package=json.loads((out/'package-audit.json').read_text('utf8'))
files=['pages/ledger-report/index.js','pages/ledger-report/index.wxml','pages/ledger-report/index.wxss','utils/ledger-report-image.js','styles/cash-fidelity.wxss','styles/cash-analysis-fidelity.wxss']
hashes={f:hashlib.sha256((root/'wechat/miniprogram'/f).read_bytes()).hexdigest() for f in files}
shutil.copyfile(root/'wechat/.qa-ledger-tmp/cash-fidelity-client-tests.log',out/'client-tests.log')
result={'date':datetime.now().isoformat(timespec='seconds'),'verdict':'needs-fixes-and-native-recheck','clientTests':{'total':270,'passed':270},'browser':{'passed':browser['passed'],'cases':browser['cases'],'actualRingPixelsChecked':True,'privacyDynamicTextsChecked':True},'currentNativeVerification':{'passed':False,'blockedBy':'APPID_ERROR / read ECONNRESET; screenshot also terminated','lastSuccessfulNativeEvidence':'2026-10-14 18:02–18:03, BEFORE preview canvas change','fixtureCleanupConfirmed':False},'geometry':metrics,'assetsPngBytes':sum(p.stat().st_size for p in (root/'wechat/miniprogram/assets/cash-fidelity').glob('*.png')),'includedRawBytes':package['includedRawBytes'],'sourceHashes':hashes,'computerUseUsed':False,'deployed':False,'uploaded':False,'realDeviceTested':False}
(out/'acceptance-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'verdict':result['verdict'],'metrics':metrics},ensure_ascii=False))
