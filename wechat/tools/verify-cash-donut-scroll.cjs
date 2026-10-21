// Uses the real component lifecycle, templates, CSS and painter with a browser wx adapter.
// Browser evidence is explicitly not native WeChat evidence.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/cash-donut-scroll-20261014'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),base=pathToFileURL(root).href
const analytics=require('../miniprogram/utils/ledger-analytics'),report=require('../miniprogram/utils/ledger-report-image'),fixture=require('../tests/fixtures/cash-redesign.cjs')
const css=f=>read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))
const html=s=>s.replace(/<(view|block|image|canvas|switch)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(scroll-view|view|picker|block|text|image)(?=[\s>])/g,(_,p,t)=>p+({'scroll-view':'wx-scroll',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[t]))
const styles=s=>s.replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img').replace(/\bscroll-view\b/g,'wx-scroll')
async function main(){
 fs.mkdirSync(out,{recursive:true});const index=path.join(out,'preview.html');fs.writeFileSync(index,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(index).href)
  const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start)
  let fragment=helper.slice(start,end).replace('window.render=(template,css,scope,base)=>','window.fragment=(template,scope,base)=>').replace(/  document.querySelectorAll\('style'\)[^\n]*\n/,'').replace('document.body.replaceChildren(...container.childNodes);scrollTo(0,0)','return container').replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')
  await new Function('page','return(async()=>{'+fragment+'})()')(page)
  await require('./white-nav-preview.cjs')(page,root)
  const widths=[[320,568,false],[390,844,false],[430,844,false],[768,844,false],[390,568,false],[320,568,true]]
  const datasets=[['single',fixture.simple('8.50')],['multi',fixture.stats],['empty',fixture.simple()],['refund',fixture.simple('0.00','128.00')]]
  for(const [width,height,large]of widths)for(const [kind,raw]of datasets){
   const model=analytics.present(analytics.snapshot(raw,'2026-10','2026-10-14'))
   await page.setViewportSize({width,height})
   await page.evaluate(({template,component,componentSource,drawRing,style,model,base,large})=>{
    document.head.querySelectorAll('style').forEach(n=>n.remove());const sheet=document.createElement('style');sheet.textContent=style+'\nbody{margin:0}wx-block{display:contents}wx-scroll{display:block;overflow-x:auto;max-width:100%;min-width:0}img{object-fit:contain}button{font-family:inherit;border:0}cash-donut{display:block;flex:none}.test-header{height:700px;padding:18px;box-sizing:border-box}.test-footer{height:900px}';document.head.append(sheet)
    document.body.replaceChildren(...fragment(template,{cashAnalysis:model,categoriesExpanded:true,reportPreview:false,cashReportMonth:10},base).childNodes)
    mountWhiteNav('pages/statistics/index',base)
    window.mountDonut=(host,data)=>{let definition;window.exports=0
    const wx={nextTick:cb=>requestAnimationFrame(cb),getWindowInfo:()=>({pixelRatio:devicePixelRatio||1}),getFileSystemManager:()=>({unlink(o){o.success?.()}}),canvasToTempFilePath(o){window.exports++;o.success({tempFilePath:o.canvas.toDataURL('image/png')})}}
    const require=name=>name.includes('ledger-analytics')?{drawRing:new Function('return '+drawRing)()}:{nativeCall:(name,options,context)=>new Promise((resolve,reject)=>wx[name]({...options,success:resolve,fail:reject},context))}
    new Function('Component','require','wx','getApp',componentSource)(d=>definition=d,require,wx,()=>({globalData:{token:'isolated'}}))
    const c={...definition.methods,data:{...definition.data,...data},setData(p,cb){Object.assign(this.data,p);const canvas=host.querySelector('canvas');host.replaceChildren(...fragment(component,this.data,base).childNodes);if(canvas)host.querySelector('canvas').replaceWith(canvas);cb?.()},createSelectorQuery(){return {select(){return this},fields(){return this},exec(cb){cb([{node:host.querySelector('canvas')}])}}}}
    window.donut=c;definition.lifetimes.ready.call(c);return c}
    mountDonut(document.querySelector('cash-donut'),{size:146,plain:false,amount:model.summary.grossDisplay,rows:model.rows})
    if(large)for(const n of document.querySelectorAll('.page span,.page button,.page wx-scroll'))n.style.fontSize=parseFloat(getComputedStyle(n).fontSize)*1.3+'px'
    window.scrollTo(0,0)
   },{template:html('<view class="page ledger-page"><view class="test-header">圆环滚动回归 · 本地隔离示例</view>'+read('templates/cash-analysis.wxml')+'<view class="test-footer"/></view>'),component:html(read('components/cash-donut/index.wxml')),componentSource:read('components/cash-donut/index.js'),drawRing:analytics.drawRing.toString(),style:styles(css('app.wxss')+'\n'+css('pages/statistics/index.wxss')+'\n'+css('components/cash-donut/index.wxss')),model,base,large})
   await page.waitForFunction(()=>!!document.querySelector('.cash-donut-image')?.complete&&!!document.querySelector('.cash-donut-image')?.naturalWidth)
   if(large)await page.evaluate(()=>{for(const n of document.querySelectorAll('.cash-donut span,.cash-donut wx-scroll'))n.style.fontSize=parseFloat(getComputedStyle(n).fontSize)*1.3+'px'})
   const before=await page.evaluate(()=>({exports:window.exports,delta:document.querySelector('.cash-donut-image').getBoundingClientRect().top-document.querySelector('.cash-analysis-card').getBoundingClientRect().top}))
   const scroll=await page.evaluate(()=>{const ring=document.querySelector('.cash-donut-image').getBoundingClientRect(),bar=document.querySelector('.tab-bar').getBoundingClientRect();return window.scrollY+ring.top-bar.top+ring.height*.4})
   for(const offset of [0,6,12,24,48,80,110,80,48,12,0,110,0]){await page.evaluate(y=>window.scrollTo(0,y),scroll+offset);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)))}
   await page.evaluate(y=>window.scrollTo(0,y),scroll)
   const result=await page.evaluate(before=>{
    const image=document.querySelector('.cash-donut-image'),ring=image.getBoundingClientRect(),card=document.querySelector('.cash-analysis-card').getBoundingClientRect(),bar=document.querySelector('.tab-bar').getBoundingClientRect()
    const hits=[...document.querySelectorAll('.tab-bar>button')].map(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b})
    const canvases=[...document.querySelectorAll('canvas')].map(n=>n.getBoundingClientRect().right),delta=ring.top-card.top
    return {exports:window.exports,relativeDrift:Math.abs(delta-before.delta),allNavigationHits:hits.every(Boolean),canvasOutsideViewport:canvases.every(x=>x<0),overlap:ring.bottom>bar.top&&ring.top<bar.bottom,overflow:document.documentElement.scrollWidth>innerWidth,imageWidth:image.naturalWidth}
   },before)
   if(result.exports!==1||result.relativeDrift>.1||!result.allNavigationHits||!result.canvasOutsideViewport||!result.overlap||result.overflow)throw Error(JSON.stringify({width,height,large,kind,...result}))
   await page.screenshot({path:path.join(out,`overlap-${kind}-${width}-${height}${large?'-large':''}.png`)})
   checks.push({width,height,large,kind,...result})
  }
  for(const [width,height,large,hidden]of [[320,568,false,false],[390,844,false,false],[430,844,false,false],[768,844,false,false],[320,568,true,false],[390,844,false,true]]){
   await page.setViewportSize({width,height});const model=analytics.present(analytics.snapshot(fixture.stats,'2026-10','2026-10-14'),!hidden)
   const result=await page.evaluate(async({template,style,model,base,plan,preview,width,large,hidden})=>{
    document.head.querySelectorAll('style').forEach(n=>n.remove());const sheet=document.createElement('style');sheet.textContent=style+'\nbody{margin:0}wx-block{display:contents}wx-scroll{display:block;overflow-x:auto}img{object-fit:contain}cash-donut{display:block}button{font-family:inherit;border:0}switch{display:block;width:48px;height:28px;background:#F4CE63;border-radius:16px}';document.head.append(sheet)
    const layout=new Function('return '+plan)()(document.createElement('canvas').getContext('2d'),model,false,large?1.3:1),reportLayout=new Function('return '+preview)()(layout,Math.min(480,width)-36),ring=reportLayout.nodes.find(n=>n.kind==='ring')
    document.body.replaceChildren(...fragment(template,{month:'2026-10',loading:false,cashAnalysis:model,reportLayout,showAmounts:!hidden},base).childNodes)
    const c=mountDonut(document.querySelector('cash-donut'),{size:ring.size,plain:true,rows:ring.rows,amount:''})
    for(let i=0;i<30&&!c.data.imagePath&&!c.data.renderError;i++)await new Promise(r=>requestAnimationFrame(r))
    const image=document.querySelector('.cash-donut-image');if(!image)throw Error('Report ring missing');await image.decode()
    const probe=document.createElement('canvas');probe.width=image.naturalWidth;probe.height=image.naturalHeight;const ctx=probe.getContext('2d');ctx.drawImage(image,0,0);const alpha=(x,y)=>ctx.getImageData(x,y,1,1).data[3]
    return {kind:'report',exports:window.exports,hasImage:!!image.naturalWidth,transparentCorner:alpha(0,0)===0,transparentCenter:alpha(Math.floor(probe.width/2),Math.floor(probe.height/2))===0,canvasOutsideViewport:[...document.querySelectorAll('canvas')].every(c=>c.getBoundingClientRect().right<0),hidden:!hidden||![...document.querySelectorAll('.cash-report-dynamic')].some(n=>/¥|3,140\.50|6,000\.00|2,859\.50/.test(n.textContent)),overflow:document.documentElement.scrollWidth>innerWidth}
   },{template:html(read('pages/ledger-report/index.wxml')),style:styles(css('app.wxss')+'\n'+css('pages/ledger-report/index.wxss')+'\n'+css('components/cash-donut/index.wxss')),model,base,plan:report.plan.toString(),preview:report.preview.toString(),width,large,hidden})
   if(!result.hasImage||!result.transparentCorner||!result.transparentCenter||!result.canvasOutsideViewport||!result.hidden||result.overflow)throw Error(JSON.stringify(result))
   checks.push({width,height,large,masked:hidden,...result});await page.screenshot({path:path.join(out,`report-${width}${large?'-large':''}${hidden?'-hidden':''}.png`),fullPage:true})
  }
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,cases:checks.length,native:false,usesRealComponentLogic:true,remoteWrites:0,checks},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
