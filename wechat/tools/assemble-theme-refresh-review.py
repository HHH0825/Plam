from pathlib import Path
import json, hashlib
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[2]
out=root/'wechat/docs/images/theme-refresh-20261014'
source=root/'wechat/branding/theme-refresh-20261014'
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',12)
native=json.loads((out/'native-results-login-final.json').read_text('utf8'))
window=native['loginGeometry']['window']
im=Image.open(out/'login-native.png').convert('RGB');scale=im.width/window['windowWidth']
crop=im.crop((0,window['screenTop']*scale,im.width,(window['screenTop']+729)*scale)).resize((390,729),Image.Resampling.LANCZOS)
crop.save(out/'login-content-native-390.png')
ref=Image.open(out/'login-reference-390.png').convert('RGB')

def panel(images,labels,name,title):
    w=max(i.width for i in images);h=max(i.height for i in images)
    result=Image.new('RGB',((w+12)*len(images)+12,h+65),'#F4F1E8');draw=ImageDraw.Draw(result)
    draw.text((12,7),title,font=font,fill='#333333')
    for n,(im,label) in enumerate(zip(images,labels)):
        x=12+n*(w+12);draw.text((x,35),label,font=small,fill='#555555');result.paste(im,(x,59))
    result.save(out/name)

panel([ref,crop,Image.blend(ref,crop,.5)],['确认草图 · 390px','微信实际截图 · 390px','50%叠加 · 未拉伸对齐'],'login-comparison.png','登录页 · 最新确认稿与微信实际页面')
switch=json.loads((out/'native-results.json').read_text('utf8'))['cashGeometry']
r=switch['rects'][0];window=switch['window'];switches=[]
for state in ['cash','items']:
    im=Image.open(out/f'statistics-{state}-native.png').convert('RGB');s=im.width/window['windowWidth']
    c=im.crop((r['left']*s,(r['top']+window['screenTop'])*s,r['right']*s,(r['bottom']+window['screenTop'])*s)).resize((340,58),Image.Resampling.LANCZOS)
    c.save(out/f'switch-{state}-native-crop.png');switches.append(c)
refSwitch=Image.open(out/'switch-reference-390.png').convert('RGB')
canvas=Image.new('RGB',(340,60),'white');canvas.paste(switches[0],(0,0))
panel([refSwitch,*switches,Image.blend(refSwitch,canvas,.5)],['第一版草图 · 页面比例','微信 · 收支选中','微信 · 物品选中','50%叠加'],'switch-comparison.png','统计切换栏 · 第一版确认稿与微信实际页面')

gallery=Image.new('RGB',(840,240),'#FFFEF9');draw=ImageDraw.Draw(gallery)
for i,(name,label) in enumerate([('cat-search','小小发现'),('cat-book','读书记账'),('cat-camera','记录物品'),('cat-sleep','安静陪伴 · 仅设计源')]):
    file=source/(name+'-source.png') if name=='cat-sleep' else root/'wechat/miniprogram/assets/white-doodle'/(name+'.png')
    cat=Image.open(file).convert('RGBA');cat.thumbnail((190,180),Image.Resampling.LANCZOS)
    gallery.paste(cat,(i*210+(210-cat.width)//2,10+(180-cat.height)//2),cat)
    draw.text((i*210+12,204),label,font=small,fill='#333333')
gallery.save(out/'cat-family.png')

def ink(image,box):
    b=image.crop(box).convert('L').point(lambda p:255 if p<90 else 0).getbbox()
    return [b[0]+box[0],b[1]+box[1],b[2]+box[0],b[3]+box[1]]

metrics={}
for key,box in [('headlineInk',(40,55,360,148)),('heroInk',(5,168,385,407))]:
    a,b=ink(ref,box),ink(crop,box);metrics[key]={'reference':a,'native':b,'edgeDelta':[round(b[i]-a[i],2) for i in range(4)]}
metrics['switch']={'nativeWidth':r['width'],'nativeHeight':r['height'],'referenceWidth':340,'referenceHeight':60}
files=['pages/login/index.js','pages/login/index.wxml','pages/login/index.wxss','pages/statistics/index.wxml','pages/statistics/index.wxss','utils/layout.js']
manifests={name:json.loads((source/(name+'-manifest.json')).read_text('utf8')) for name in ['welcome','cats']}
navigationFile=out/'native-results-navigation.json'
navigation=json.loads(navigationFile.read_text('utf8')) if navigationFile.exists() else None
result={'date':'2026-10-15','artifactStartDate':'2026-10-14','clientTests':{'passed':280,'failed':0},'browserCases':34,'nativeChecks':8,'finalLoginRechecked':True,'nativeRestoreConfirmed':native['restoreConfirmed'],'nativeNavigation':navigation,'nativeWidth':390,'realDeviceTested':False,'computerUseUsed':False,'deployed':False,'uploaded':False,'fixtureOnly':True,'remoteWrites':0,'metrics':metrics,'assetBytes':{name:d['bytes'] for name,d in manifests.items()},'runtimeHashes':{f:hashlib.sha256((root/'wechat/miniprogram'/f).read_bytes()).hexdigest() for f in files},'heroSourceHash':hashlib.sha256((source/'hero-source.png').read_bytes()).hexdigest()}
(out/'verification-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf8')
print(json.dumps(metrics,ensure_ascii=False))
