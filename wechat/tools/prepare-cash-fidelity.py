"""Trace independent editable SVG details from the approved original design.
No complete screen is used as a runtime background; dynamic copy is never traced.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import json, math

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'branding/cash-fidelity-20261014'
QA=ROOT/'docs/images/cash-fidelity-20261014'
SOURCE.mkdir(parents=True,exist_ok=True);QA.mkdir(parents=True,exist_ok=True)
first=Image.open(ROOT/'docs/images/cash-redesign-20261014/approved-ledger-me.png').convert('RGB')
second=Image.open(ROOT/'docs/images/cash-redesign-20261014/approved-statistics-report.png').convert('RGB')

def svg(name,body,w,h):
    (SOURCE/(name+'.svg')).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>\n',encoding='utf8')

def contours(mask):
    # Directed boundary edges, including holes. Straight runs are merged.
    pix=mask.load();w,h=mask.size;edges={}
    def edge(a,b):edges.setdefault(a,[]).append(b)
    for y in range(h):
        for x in range(w):
            if not pix[x,y]:continue
            if y==0 or not pix[x,y-1]:edge((x,y),(x+1,y))
            if x==w-1 or not pix[x+1,y]:edge((x+1,y),(x+1,y+1))
            if y==h-1 or not pix[x,y+1]:edge((x+1,y+1),(x,y+1))
            if x==0 or not pix[x-1,y]:edge((x,y+1),(x,y))
    paths=[]
    while edges:
        start=next(iter(edges));p=start;points=[p]
        while True:
            nxt=edges[p].pop()
            if not edges[p]:del edges[p]
            p=nxt
            if p==start:break
            points.append(p)
        area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))/2
        if abs(area)<2:continue
        result=[]
        for i,p in enumerate(points):
            prev=points[i-1];nxt=points[(i+1)%len(points)]
            if (p[0]-prev[0])*(nxt[1]-p[1])!=(p[1]-prev[1])*(nxt[0]-p[0]):result.append(p)
        if result:paths.append('M'+' '.join(f'{x},{y}' for x,y in result)+'Z')
    return ''.join(paths)

palette=[('#34332F',(52,51,47)),('#FFB1BF',(255,177,191)),('#FFD96B',(255,217,107)),('#E7B489',(231,180,137)),('#9DBA90',(157,186,144))]
def trace(name,image,box,black=False,erase=None):
    im=image.crop(box);w,h=im.size;masks=[Image.new('L',im.size) for _ in palette];combined=Image.new('L',im.size)
    for y in range(h):
        for x in range(w):
            r,g,b=im.getpixel((x,y));idx=None
            if max(r,g,b)<153:idx=0
            elif not black:
                if r>190 and r-g>25 and b>=g-15:idx=1
                elif r>185 and r-g>10 and g-b>30:idx=2 if g>170 else 3
                elif g>90 and g-r>5 and g-b>5:idx=4
            if idx is not None:masks[idx].putpixel((x,y),255);combined.putpixel((x,y),255)
    if erase:
        for rect in erase:
            for mask in masks:ImageDraw.Draw(mask).rectangle(rect,fill=0)
            ImageDraw.Draw(combined).rectangle(rect,fill=0)
    body=''
    if not black:
        # Enclosed white areas remain opaque white, outside paper stays transparent.
        filled=combined.copy();ImageDraw.floodfill(filled,(0,0),128)
        holes=filled.point(lambda v:255 if v==0 else 0)
        body=f'<path d="{contours(holes)}" fill="#FFFDF8" fill-rule="evenodd"/>'
    for mask,(color,_) in reversed(list(zip(masks,palette))):
        path=contours(mask)
        if path:body+=f'<path d="{path}" fill="{color}" fill-rule="evenodd"/>'
    svg(name,body,w,h)

trace('report-title',second,(786,140,1171,211),True,erase=[(350,0,385,10)])
trace('report-section',second,(770,542,1145,588),True)
trace('report-footprints',second,(771,904,1045,947),True)
trace('peek-cat',second,(1080,60,1224,159),erase=[(0,85,92,99)])
trace('corner-cat',second,(1138,976,1214,1050),erase=[(70,0,76,35)])
trace('mini-cat',second,(1150,414,1210,468))
trace('reading-cat',second,(157,1047,229,1112))
trace('sprout',second,(699,991,755,1053),erase=[(0,58,56,62)])
trace('pink-paw',first,(492,322,567,389))
svg('hero-strokes','<g fill="none" stroke="#FFD041" stroke-width="5" stroke-linecap="round"><path d="M22 24L18 10M17 43L3 35M17 63L4 70M416 24L423 12M422 44L437 43M416 64L425 75"/></g>',440,88)

INK='#5A4A34'
svg('underline','<path d="M4 11Q90-2 195 4" fill="none" stroke="#FFD941" stroke-width="7" stroke-linecap="round"/><path d="M7 12Q92 0 190 6" fill="none" stroke="#FFE370" stroke-width="2" stroke-linecap="round"/>',200,18)
svg('binding',f'<path d="M5 5Q1 5 2 11Q3 15 8 14L21 12Q26 9 22 4Q19 2 15 4Z" fill="#FFF9E6" stroke="{INK}" stroke-width="2.3"/>',26,18)
svg('fold',f'<path d="M2 2L31 30L3 28Z" fill="#FFFDF3" stroke="{INK}" stroke-width="1.8"/><path d="M6 7L7 24L25 25" fill="none" stroke="#A3977D" stroke-width="1"/>',34,34)
for name,d in {'tl':'M3 24Q1 5 20 4L30 3M7 25Q4 8 23 7L30 6','tr':'M0 3L11 4Q28 3 27 24M0 7L11 8Q24 7 24 25','bl':'M3 0L4 13Q3 27 24 27L30 26M7 0L8 14Q6 24 25 24L30 23','br':'M0 27L14 26Q28 27 27 5L26 0M0 24L13 23Q24 25 23 5L23 0'}.items():svg('frame-'+name,f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1.5" stroke-linecap="round"/>',30,30)
svg('edge-h',f'<path d="M0 4Q22 2 40 3T80 4M0 7Q19 5 40 6T80 7" fill="none" stroke="{INK}" stroke-width="1.2"/>',80,10)
svg('edge-v',f'<path d="M4 0Q2 20 3 40T4 80M7 0Q5 20 6 40T7 80" fill="none" stroke="{INK}" stroke-width="1.2"/>',10,80)
def icon(name,body):svg(name,f'<g fill="none" stroke="#36352F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{body}</g>',40,40)
icon('wallet','<path d="M8 12L27 8L30 30L9 33Z" fill="#FFE36B"/><path d="M14 11L13 5L20 4L22 11" fill="#FFFDF4"/><path d="M26 17L34 16L35 23L28 25Z" fill="#FFF3C5"/><circle cx="30" cy="21" r="1" fill="#36352F"/>')
icon('bars','<path d="M6 22L13 21L13 34L6 34Z" fill="#FFF8D1"/><path d="M16 14L23 13L23 34L16 34Z" fill="#FFE376"/><path d="M26 6L33 6L33 34L26 34Z" fill="#F8CD77"/>')
icon('fork','<path d="M8 4L8 13Q8 18 13 18Q18 18 18 12V4M13 4V35M28 4Q20 16 28 20L31 20V35M31 4V20"/>')
icon('calendar','<path d="M6 10L33 9L34 34L6 35Z" fill="#FFFDF5"/><path d="M6 17H33M13 4V13M26 4V12"/><g stroke="#E7BB58"><path d="M12 23H13M21 23H22M12 29H13M21 29H22"/></g>')
spec={
 'referencePhoneWidth':525,'normalizedWidth':390,
 'crops':{'ledger':[118,186,625,616],'me':[699,367,1195,659],'statistics':[145,697,596,1037],'report':[664,55,1224,1083]},
 'ledger':{'width':376.6,'height':319.4,'mainFont':44,'secondaryFont':24,'pawWidth':48},
 'me':{'sectionFont':15,'cashFont':18,'rowDividers':True},
 'statistics':{'chartWidth':146,'legendRows':'inline','refundRows':'inline','discoveryMinHeight':64},
 'report':{'width':720,'referenceHeight':1322,'titleWidth':482,'mainFont':72,'ringDiameter':276},
 'publicElements':'keep existing avatar, navigation and menu icons; native title chrome excluded from comparison'}
(SOURCE/'design-tokens.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding='utf8')
for name,box in spec['crops'].items():
    im=(first if name in ('ledger','me') else second).crop(tuple(box));im.resize((390,round(im.height*390/im.width)),Image.Resampling.LANCZOS).save(QA/(name+'-reference.png'))
print(json.dumps({'svgFiles':len(list(SOURCE.glob('*.svg'))),'source':str(SOURCE)}))
