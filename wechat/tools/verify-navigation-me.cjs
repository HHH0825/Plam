// Screenshot actual component markup/styles, with no account or backend access.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright'),sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/navigation-me-20261015')
async function main(){
 fs.mkdirSync(out,{recursive:true})
 const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(entry).href);await require('./white-nav-preview.cjs')(page,root)
  for(const[width,large]of [[320,false],[390,false],[430,false],[320,true]])for(const selected of ['statistics','me']){
   await page.setViewportSize({width,height:150})
   await page.evaluate(({selected,base,large})=>{
    document.body.replaceChildren();document.body.style.cssText='margin:0;background:#FFFCF5;font-family:Arial,"Microsoft YaHei",sans-serif'
    mountWhiteNav('pages/'+selected+'/index',base)
    const label=document.createElement('div');label.textContent='本地预览 · '+(selected==='me'?'我的选中':'我的未选中');label.style.cssText='padding:10px 14px;font-size:12px;color:#777';document.body.prepend(label)
    if(large){const nodes=[...document.querySelectorAll('.nav-button,.nav-button>span')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);nodes.forEach(([n,s])=>n.style.fontSize=s*1.3+'px')}
   },{selected,base:pathToFileURL(root).href,large})
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
   const result=await page.evaluate(()=>{
    const me=document.querySelector('.tab-me'),icon=me.querySelector('img'),ir=icon.getBoundingClientRect(),mr=me.getBoundingClientRect()
    return {selected:me.classList.contains('selected'),iconWidth:ir.width,iconHeight:ir.height,opacity:getComputedStyle(icon).opacity,barHeight:document.querySelector('.tab-bar').getBoundingClientRect().height,buttons:[...document.querySelectorAll('.nav-button')].map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===n}}),overflow:document.documentElement.scrollWidth>innerWidth,imagesValid:[...document.images].every(i=>i.naturalWidth>0),labelComplete:me.textContent.trim()==='我的'&&ir.bottom<=me.querySelector('span').getBoundingClientRect().top+1,iconInside:ir.left>=mr.left&&ir.right<=mr.right}
   })
   if(result.selected!==(selected==='me')||result.iconWidth!==26||result.iconHeight!==26||result.barHeight!==64||result.overflow||!result.imagesValid||!result.labelComplete||!result.iconInside||result.buttons.some(b=>b.width<44||b.height<44||!b.hit))throw Error(JSON.stringify({width,large,selected,...result}))
   checks.push({width,large,state:selected,...result});await page.screenshot({path:path.join(out,`${selected}-${width}${large?'-large':''}-local.png`)})
  }
  // Reference is a low-resolution crop only for review; it is never a runtime asset.
  const reference=path.resolve(__dirname, '../../test-results/local-inputs/screenshots/屏幕截图 2026-10-15 134702.png')
  await sharp(reference).extract({left:642,top:214,width:34,height:25}).png().toFile(path.join(out,'reference-crop.png'))
  const svg=fs.readFileSync(path.resolve(__dirname,'../branding/navigation-me-20261015/my-cat.svg'))
  await sharp(svg).resize(256,256).flatten({background:'#FFFFFF'}).png().toFile(path.join(out,'my-cat-large.png'))
  fs.writeFileSync(path.join(out,'local-results.json'),JSON.stringify({passed:true,cases:checks.length,native:false,computerUseUsed:false,checks},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
