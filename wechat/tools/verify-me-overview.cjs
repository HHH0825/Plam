// Render production page and navigation with isolated fixtures, no account requests.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const {avatarState}=require('../miniprogram/utils/profile')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/me-overview-20261011'),scratch=path.resolve(__dirname,'../.qa-me-refresh')
const read=f=>fs.readFileSync(path.join(root,f),'utf8')
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.join(path.posix.dirname(f),s)))}
const markup=read('pages/me/index.wxml').replace(/<(view|block|image)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|block)(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
const stylesheet=(css('app.wxss')+'\n'+css('pages/me/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w-])image\b/g,'img')
const user={id:99001,username:'微信用户1',avatar_key:'cat'},base={user,...avatarState(user),loading:false,error:'',statsLoading:false,statsError:'',heldItems:'28',heldAmount:'12,680.00',accountDays:'128',statsCompatible:true,ageCompatible:true}
const cases=[...[320,390,430,768].map(width=>({label:'default-'+width,width,height:844})),
 {label:'320-long-large',width:320,height:640,font:1.3,data:{user:{...user,username:'收藏生活记录每一件物品的故事'.repeat(2)},heldItems:'123456',heldAmount:'999,999,999.99',accountDays:'10000'}},
 {label:'390-large',width:390,height:753,font:1.3},
 {label:'empty',width:390,height:753,data:{heldItems:'0',heldAmount:'0.00',accountDays:'1'}},
 {label:'legacy',width:390,height:753,data:{heldItems:'—',heldAmount:'—',accountDays:'—',statsCompatible:false,ageCompatible:false}},
 {label:'stats-error',width:390,height:753,data:{heldItems:'—',heldAmount:'—',statsError:'网络暂不可用，请重试'}},
 {label:'profile-error',width:390,height:753,data:{user:null,avatarPath:'',accountDays:'—',error:'资料暂不可用，请重新读取'}},
 {label:'loading',width:390,height:753,data:{user:null,avatarPath:'',loading:true,statsLoading:true}},
 {label:'avatar-fallback',width:320,height:640,data:{avatarFailed:true}}
]
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'me.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body></body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
 const previous=fs.readFileSync(path.resolve(__dirname,'verify-white-secondary.cjs'),'utf8')
 await page.evaluate(previous.slice(previous.indexOf(' window.render='),previous.indexOf('\n })\n for(const width')))
 await require('./white-nav-preview.cjs')(page,root)
 for(const c of cases){
  await page.setViewportSize({width:c.width,height:c.height});await page.evaluate(args=>render(...args),[markup,stylesheet,{...base,...c.data},pathToFileURL(root).href])
  await page.evaluate(base=>{const bar=document.createElement('div');bar.className='native-bar';bar.textContent='我的';bar.style.justifyContent='center';document.body.prepend(bar);window.mountWhiteNav(1,base);document.querySelectorAll('img').forEach(i=>i.style.objectFit='contain')},pathToFileURL(root).href)
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
  if(c.font)await page.evaluate(scale=>{const targets=[...document.querySelectorAll('.page div,.page span,.page button')].map(n=>[n,getComputedStyle(n).fontSize]);for(const[n,size]of targets)n.style.fontSize=parseFloat(size)*scale+'px'},c.font)
  const check=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};const avatar=rect('.profile-hero');return{overflow:document.documentElement.scrollWidth>innerWidth,avatar,centered:Math.abs(avatar.x+avatar.width/2-innerWidth/2)<1,radius:getComputedStyle(document.querySelector('.profile-hero')).borderRadius,card:rect('.overview-card'),page:rect('.page'),menuHeights:[...document.querySelectorAll('.menu')].map(n=>n.getBoundingClientRect().height),failedImages:[...document.images].filter(i=>!i.naturalWidth).length,clipped:[...document.querySelectorAll('.overview-value,.profile-name,.menu-title')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className),statsError:!!document.querySelector('.overview-error'),compat:!!document.querySelector('.overview-compat'),feedbackNative:document.querySelector('#menu-feedback').getAttribute('open-type')==='feedback'}})
  checks.push({label:c.label,...check})
  if(check.overflow||!check.centered||check.radius!=='50%'||check.page.width>480||check.menuHeights.some(h=>h<56)||check.failedImages||check.clipped.length||!check.feedbackNative)throw Error(JSON.stringify(checks.at(-1)))
  await page.screenshot({path:path.join(out,c.label+'.png'),fullPage:true})
  if(c.label==='default-390')await page.screenshot({path:path.join(out,'first-screen.png')})
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
  const footer=await page.evaluate(()=>({logout:document.querySelector('.logout-button').getBoundingClientRect().bottom,nav:document.querySelector('.tab-bar').getBoundingClientRect().top}))
  if(footer.logout>footer.nav)throw Error('Logout covered: '+JSON.stringify(footer))
  if(c.label==='default-390')await page.screenshot({path:path.join(out,'scrolled.png')})
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,fixtureOnly:true,checks},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
