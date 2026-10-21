// Render production WXML/WXSS with isolated view fixtures, never account data.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const {welcomeLayout}=require('../miniprogram/pages/login/lib/layout')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/welcome-collection-20261011'),scratch=path.resolve(__dirname,'../.qa-welcome')
const read=file=>fs.readFileSync(path.join(root,file),'utf8')
function css(file){return read(file).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.join(path.posix.dirname(file),s)))}
const markup=read('pages/login/index.wxml').replace(/<(view|block|image)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|block)(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
const stylesheet=(css('app.wxss')+'\n'+css('pages/login/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w-])image\b/g,'img')
const base={busy:false,error:'',logoFailed:false,titleFailed:false,heroFailed:false,cameraFailed:false,featureFailed:false,decorFailed:false,devLogin:false}
const cases=[
 {label:'390',width:390,height:753}, {label:'320-short',width:320,height:504},
 {label:'430',width:430,height:820}, {label:'tablet',width:768,height:960},
 {label:'320-large-font',width:320,height:640,font:1.3}, {label:'390-large-font',width:390,height:753,font:1.3},
 {label:'loading',width:390,height:753,data:{busy:true}},
 {label:'failure',width:390,height:753,data:{error:'网络暂时不可用，请稍后重试'}},
 {label:'art-fallback',width:320,height:640,data:{titleFailed:true,heroFailed:true,logoFailed:true,cameraFailed:true,featureFailed:true,decorFailed:true}}
]
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'welcome.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body></body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
 const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
 const previous=fs.readFileSync(path.resolve(__dirname,'verify-white-secondary.cjs'),'utf8')
 const renderer=previous.slice(previous.indexOf(' window.render='),previous.indexOf('\n })\n for(const width'))
 await page.evaluate(renderer)
 for(const c of cases){
  await page.setViewportSize({width:c.width,height:c.height})
  const scope={...base,...welcomeLayout({windowWidth:c.width,windowHeight:c.height}),...c.data}
  await page.evaluate(args=>render(...args),[markup,stylesheet,scope,pathToFileURL(root).href])
  await page.evaluate(()=>{document.querySelectorAll('[disabled="false"]').forEach(n=>n.removeAttribute('disabled'));document.querySelectorAll('img').forEach(i=>i.style.objectFit=i.classList.contains('days-ring')?'fill':'contain')})
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
  if(c.font)await page.evaluate(scale=>{const targets=[...document.querySelectorAll('div,span,button')].map(n=>[n,getComputedStyle(n).fontSize]);for(const [n,size]of targets)n.style.fontSize=(parseFloat(size)*scale)+'px'},c.font)
  const check=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}}
    const tag=getComputedStyle(document.querySelector('.brand-tag'))
    const button=document.querySelector('.login-button'),note=document.querySelector('.welcome-note')
    const clipped=[...document.querySelectorAll('.sample-number,.feature,.sample-top,.login-button')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className)
    const label=rect('.sample-label'),demo=rect('.sample-disclaimer'),content=rect('.sample-content'),status=getComputedStyle(document.querySelector('.sample-status'))
    const headerOverlap=label.x<demo.right&&label.right>demo.x&&label.y<demo.bottom&&label.bottom>demo.y
    return {overflow:document.documentElement.scrollWidth>innerWidth,clipped,page:rect('.page'),art:rect('.welcome-art'),card:rect('.sample-card'),button:rect('.login-button'),note:rect('.welcome-note'),sample:{label,demo,content,headerOverlap,statusBackground:status.backgroundColor},tag:{background:tag.backgroundColor,border:tag.borderWidth,font:tag.fontSize},failedImages:[...document.images].filter(i=>!i.naturalWidth).length,disabled:button.disabled,position:getComputedStyle(button).position,bg:getComputedStyle(document.body).backgroundColor,features:document.querySelectorAll('.feature-hints button').length,hasCaption:note.textContent.includes('首次登录')}
  })
  checks.push({label:c.label,...check})
  if(check.overflow||check.clipped.length||check.failedImages||check.page.width>430||check.button.height<44||check.tag.background!=='rgba(0, 0, 0, 0)'||check.features||check.bg!=='rgb(255, 255, 255)'||!check.hasCaption)throw Error(JSON.stringify(checks.at(-1)))
  if(c.label==='loading'&&!check.disabled)throw Error('Loading button must be disabled')
  if(check.sample.headerOverlap||check.sample.demo.bottom>check.sample.content.y||check.sample.statusBackground!=='rgba(0, 0, 0, 0)')throw Error('Sample header/status layout: '+JSON.stringify(check.sample))
  await page.screenshot({path:path.join(out,c.label+'.png'),fullPage:true})
  await page.locator('.welcome-note').scrollIntoViewIfNeeded()
  if(!await page.locator('.login-button').isVisible())throw Error('Login must remain reachable')
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({checks,passed:true,fixtureOnly:true},null,2));console.log(JSON.stringify({checks:checks.length,passed:true}))
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
