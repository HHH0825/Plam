from pathlib import Path
p=Path(__file__).parent
s=(p/'verify-cash-redesign.cjs').read_text('utf8').replace('../docs/images/cash-redesign-20261014','../docs/images/cash-fidelity-20261014')
s=s.replace("let template=markup", "if(name==='ledger-report')data.reportLayout=await page.evaluate(({plan,preview,model,width,large})=>{const ctx=document.createElement('canvas').getContext('2d'),layout=new Function('return '+plan)()(ctx,model,false,large?1.3:1);return new Function('return '+preview)()(layout,Math.min(480,width)-36)},{plan:reportImage.plan.toString(),preview:reportImage.preview.toString(),model:data.cashAnalysis,width,large});\n  let template=markup")
s=s.replace("template=template.replace(/<cash-donut[^>]*\\/>/g,", "template=template.replace(/<cash-donut[^>]*plain=\"[^\"]*\"[^>]*\\/>/g,'<view class=\"cash-donut\" style=\"width:{{item.size}}px;height:{{item.size}}px\"><canvas class=\"cash-donut-canvas report-ring\" style=\"width:{{item.size}}px;height:{{item.size}}px\"></canvas></view>').replace(/<cash-donut[^>]*\\/>/g,")
s=s.replace('if(large)await page.evaluate','if(large&&name!==\'ledger-report\')await page.evaluate')
s=s.replace("c.width=292;c.height=292;const ctx=c.getContext('2d');ctx.scale(2,2);draw(ctx,rows,73,73,54,25)", "const size=c.classList.contains('report-ring')?parseFloat(c.style.width):146;c.width=size*2;c.height=size*2;const ctx=c.getContext('2d');ctx.scale(2,2);draw(ctx,rows,size/2,size/2,size*(c.classList.contains('report-ring')?109/276:.37),size*(c.classList.contains('report-ring')?58/276:.17))")
s=s.replace("for(const c of document.querySelectorAll('.cash-donut-canvas'))", "for(const c of document.querySelectorAll('.cash-donut-canvas,.cash-report-preview-ring'))")
s=s.replace("const size=c.classList.contains('report-ring')?parseFloat(c.style.width):146", "const plain=c.classList.contains('report-ring')||c.classList.contains('cash-report-preview-ring'),size=plain?(parseFloat(c.style.width)||c.parentElement.clientWidth):146")
s=s.replace("c.classList.contains('report-ring')?109/276", "plain?109/276").replace("c.classList.contains('report-ring')?58/276", "plain?58/276")
s=s.replace("!!document.querySelector('.cash-donut-canvas')", "!!document.querySelector('.cash-donut-canvas,.cash-report-preview-ring')")
s=s.replace("!!document.querySelector('.cash-donut-canvas,.cash-report-preview-ring')", "[...document.querySelectorAll('.cash-donut-canvas,.cash-report-preview-ring')].some(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((v,i)=>i%4===3&&v>128)})")
s=s.replace("document.querySelectorAll('.cash-report-paper .ledger-nowrap')", "document.querySelectorAll('.cash-report-paper .cash-report-dynamic')")
s=s.replace("some(n=>/¥|\\d/.test(n.textContent))", "some(n=>/¥|3,140\\.50|6,000\\.00|2,859\\.50|128\\.00/.test(n.textContent))")
s=s.replace("checks.push({name,key,width,large,...result});", "if(width===390&&!large&&['panel','overview','donut','report'].includes(key)){const selector={ledger:'.ledger-journal-panel',me:'.overview-shell',statistics:'.cash-analysis-card','ledger-report':'.cash-report-paper'}[name],box=await page.locator(selector).boundingBox();fs.writeFileSync(path.join(out,name+'-geometry-browser.json'),JSON.stringify({width,selector,box},null,2));await page.locator(selector).screenshot({path:path.join(out,name+'-component-browser.png')})}checks.push({name,key,width,large,...result});")
s=s.replace("document.querySelector('.ledger-summary-bottom').clientWidth)","document.querySelector('.ledger-summary-bottom').clientWidth-44,{mainSizes:[44,40,36,32,30,28],smallSizes:[24,22,20,18,16]})")
s=s.replace("await page.evaluate(({plan,draw,ring,model})=>", "await page.evaluate(async({plan,draw,ring,model,base})=>")
s=s.replace("new Function('drawRing','return '+draw)(new Function('return '+ring)())(ctx,layout)","const images={};await Promise.all([...new Set(layout.commands.filter(c=>c.kind==='image').map(c=>c.src))].map(src=>new Promise(resolve=>{const im=new Image();im.onload=()=>{images[src]=im;resolve()};im.onerror=resolve;im.src=base+src})));new Function('drawRing','return '+draw)(new Function('return '+ring)())(ctx,layout,images)")
s=s.replace("ring:a.drawRing.toString(),model:m}","ring:a.drawRing.toString(),model:m,base}")
# Keep the older layout matrix aligned with ordinary-image presentation. The
# dedicated scroll verifier additionally runs the actual component lifecycle.
import re
s=s.replace('<canvas class="cash-donut-canvas', '<image class="cash-donut-image').replace('</canvas></view>', '</image></view>').replace('</canvas><view class="cash-donut-center">', '</image><view class="cash-donut-center">')
lines=s.splitlines()
for i,line in enumerate(lines):
    if 'await page.evaluate(({source,rows})' in line:
        lines[i]="  await page.evaluate(({source,rows})=>{const draw=new Function('return '+source)();for(const image of document.querySelectorAll('.cash-donut-image')){const plain=image.classList.contains('report-ring'),size=plain?parseFloat(image.style.width):146,c=document.createElement('canvas');c.width=c.height=Math.round(size*2);const ctx=c.getContext('2d');ctx.scale(2,2);draw(ctx,rows,size/2,size/2,size*(plain?109/276:.37),size*(plain?58/276:.17));image.style.width=image.style.height=size+'px';image.src=c.toDataURL('image/png')}} ,{source:a.drawRing.toString(),rows:data.cashAnalysis?.rows||[]})"
s='\n'.join(lines)+'\n'
s=re.sub(r'hasRing:.*?,hidden:',"hasRing:name!=='statistics'&&name!=='ledger-report'||[...document.querySelectorAll('.cash-donut-image')].some(im=>{if(!im.naturalWidth)return false;const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>128)}),hidden:",s)
(p/'verify-cash-fidelity.cjs').write_text(s,'utf8')
