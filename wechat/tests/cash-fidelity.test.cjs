const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const image=require('../miniprogram/utils/ledger-report-image'),analytics=require('../miniprogram/utils/ledger-analytics'),calendar=require('../miniprogram/utils/ledger-calendar'),fixture=require('./fixtures/cash-redesign.cjs')
const ctx={font:'',measureText(s){const size=Number(this.font.match(/([\d.]+)px/)[1]);return {width:[...s].reduce((n,c)=>n+(/[\u3400-\u9fff]/.test(c)?size:size*.55),0)}}}
const model=analytics.present(analytics.snapshot(fixture.stats,'2026-10','2026-10-14'))
test('preview and export use the exact same report coordinates and assets',()=>{
 const layout=image.plan(ctx,model),preview=image.preview(layout,354),scale=354/720
 assert.equal(preview.nodes.length,layout.commands.length);assert.equal(preview.height,layout.height*scale)
 for(let i=0;i<layout.commands.length;i++){const c=layout.commands[i],n=preview.nodes[i];assert.equal(n.kind,c.kind);assert.equal(n.text,c.text);assert.equal(n.src,c.src);if(c.kind==='text'){assert.ok(n.style.includes('font-size:'+(c.size*scale).toFixed(3)+'px'));assert.ok(n.style.includes('top:'+((c.y-c.size*.84)*scale).toFixed(3)+'px'))}}
 assert.ok(layout.commands.some(c=>c.src?.endsWith('peek-cat.png')));assert.ok(layout.commands.some(c=>c.src?.endsWith('report-title.png')));assert.ok(layout.commands.some(c=>c.kind==='text'&&c.size===72));assert.equal(layout.commands.filter(c=>c.kind==='ring').length,1)
})
test('report masks every numeric money node and grows for large text and long categories',()=>{
 const normal=image.plan(ctx,model),larger=image.plan(ctx,model,false,1.3);assert.ok(larger.height>normal.height)
 const hidden=image.preview(image.plan(ctx,analytics.present(analytics.snapshot(fixture.stats,'2026-10','2026-10-14'),false)),284)
 assert.doesNotMatch(hidden.nodes.map(n=>n.text||'').join(' '),/¥|3,140|6,000|2,859|128\.00/)
 const raw=fixture.simple('123456789012345678901.01');raw.categories[0].name='长分类'.repeat(25);const long=image.plan(ctx,analytics.present(analytics.snapshot(raw,'2026-10','2026-10-14')))
 assert.ok(long.height>normal.height);for(const c of long.commands.filter(c=>c.kind==='text')){ctx.font=c.weight+' '+c.size+'px sans-serif';assert.ok(c.x>=40);assert.ok(c.x+ctx.measureText(c.text).width<=666.01)}
})
test('ledger uses 44px at regular width and preserves legacy layout defaults',()=>{
 const probes={};for(const size of [44,40,36,32,30,28])probes['main-'+size]={width:size*5};for(const size of [24,22,20,18,16])for(const key of ['income','net'])probes[key+'-'+size]={width:size*5}
 assert.equal(calendar.panelLayout(320,probes,310,{mainSizes:[44,40,36,32,30,28],smallSizes:[24,22,20,18,16]}).mainSize,44)
 assert.equal(calendar.panelLayout(320,probes,310).mainSize,32)
})
test('all isolated SVG assets have transparent small runtime counterparts and no baked sample amounts',()=>{
 const root=path.resolve(__dirname,'../branding/cash-fidelity-20261014'),runtime=path.resolve(__dirname,'../miniprogram/assets/cash-fidelity');let bytes=0
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.svg'))){const source=fs.readFileSync(path.join(root,name),'utf8');assert.match(source,/<svg/);assert.doesNotMatch(source,/<image|<text|3140|3,140|6000|6,000/);const png=fs.readFileSync(path.join(runtime,name.replace('.svg','.png')));assert.equal(png.subarray(1,4).toString(),'PNG');bytes+=png.length}
 assert.ok(bytes<80*1024)
})
