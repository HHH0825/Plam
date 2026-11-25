// Offline production-template checks; no API requests or account data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/greeting-hd-20261018'),design=path.resolve(__dirname,'../docs/design/greeting-hd-20261018')
const read=f=>fs.readFileSync(path.join(root,f),'utf8')
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),p))))}
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preview.html'),'<!doctype html><meta charset="utf-8"><body>')
 const checks=[],assets=[]
 for(const [name,width,height] of [['good-day.png',384,368],['good-night.png',510,340]]){
  const file=path.join(root,'assets/rewards',name),m=await sharp(file).metadata(),s=await sharp(file).stats()
  assert.equal(m.width,width);assert.equal(m.height,height);assert.equal(m.hasAlpha,true);assert.equal(s.channels[3].min,0);assert.ok(s.channels[3].max>=250)
  assets.push({name,width,height,bytes:fs.statSync(file).size,transparent:true})
 }
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 try{
  for(const density of [2,3]){
   const context=await browser.newContext({deviceScaleFactor:density}),p=await context.newPage();await p.goto(pathToFileURL(path.join(out,'preview.html')).href);await helper.renderer(p)
   for(const [width,large] of [[320,false],[390,false],[430,false],[768,false],[320,true],[390,true]])for(const period of ['morning','evening']){
    const file='components/cat-feedback/index',template=read(file+'.wxml').replace(/<cat-loading\b[^>]*\/>/g,'').replace(/<(view|image)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(view|text|image)(?=[\s>])/g,(_,a,t)=>a+({view:'div',text:'span',image:'img'}[t]))
    const sheet=(css('app.wxss')+'\n'+css(file+'.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')+'\n.greeting-art>img{object-fit:contain}'
    const image=period==='morning'?'good-day.png':'good-night.png',data={working:false,greetingOpen:true,capacityOpen:false,sunny:period==='morning',greetingArt:'/assets/rewards/'+image,model:{greeting:{title:period==='morning'?'早上好呀，喵～':'晚上好呀，喵～',message:'收好今天的小小日常，也给自己留一点温柔。'},checkin:{today_claimed:false,today_reward:5}}}
    await p.setViewportSize({width,height:844});await p.evaluate(a=>window.render(...a),[template,sheet,data,pathToFileURL(root).href])
    if(large)await p.evaluate(()=>{const nodes=[...document.querySelectorAll('div,span,button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);nodes.forEach(([n,s])=>n.style.fontSize=s*1.3+'px')})
    await p.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
    await p.waitForTimeout(240)
    const audit=await p.evaluate(()=>{const image=document.querySelector('.greeting-art>img'),r=image.getBoundingClientRect(),d=document.querySelector('.cat-dialog');return {broken:[...document.images].filter(i=>!i.naturalWidth).length,overflow:document.documentElement.scrollWidth>innerWidth||d.scrollWidth>d.clientWidth+1,closeHeight:document.querySelector('.cat-dialog-close').getBoundingClientRect().height,natural:[image.naturalWidth,image.naturalHeight],display:[r.width,r.height]}})
    assert.equal(audit.broken,0);assert.equal(audit.overflow,false);assert.ok(audit.closeHeight>=44)
    checks.push({period,width,large,density,...audit})
    if(width===390&&!large){await p.screenshot({path:path.join(out,`${period}-${density}x.png`)});if(density===3){await p.locator('.greeting-art>img').evaluate((n,src)=>n.src=src,pathToFileURL(path.join(design,period==='morning'?'day-before.png':'night-before.png')).href);await p.screenshot({path:path.join(out,`${period}-before-3x.png`)})}}
   }
   await context.close()
  }
 }finally{await browser.close()}
 const tiles=[]
 for(const [i,n] of ['morning-before-3x','morning-3x','evening-before-3x','evening-3x'].entries())tiles.push({input:await sharp(path.join(out,n+'.png')).resize(390,844).toBuffer(),left:i%2*390,top:40+Math.floor(i/2)*884})
 const titles=Buffer.from('<svg width="780" height="1808"><style>text{font:18px Microsoft YaHei;fill:#574b34}</style><text x="20" y="27">修复前</text><text x="410" y="27">修复后 · 约增加10KB</text><text x="20" y="911">修复前</text><text x="410" y="911">修复后</text></svg>')
 await sharp({create:{width:780,height:1808,channels:4,background:'#fff9e8'}}).composite([...tiles,{input:titles,left:0,top:0}]).png().toFile(path.join(out,'清晰度对比.png'))
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,checks,assets,offline:true,realDevice:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,assets}))
}
main().catch(e=>{console.error(e);process.exitCode=1})
