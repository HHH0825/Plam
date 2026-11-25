// Offline render of the actual WXML/WXSS, with isolated membership states.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const sharp=require(process.env.PALM_SHARP_PATH || 'sharp')
const root=path.resolve(process.env.PALM_VISUAL_ROOT||path.join(__dirname,'../miniprogram')),out=path.resolve(__dirname,'../docs/images/membership-tools-20261015'),base=pathToFileURL(root).href
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/member-fixture.json'),'utf8'))
const member=require('../miniprogram/utils/member'),read=f=>fs.readFileSync(path.join(root,f),'utf8')
function css(file){return read(file).replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))))}
async function state(name,kind,overrides={}){
 let definition;const file=path.join(root,'pages',name,'index.js'),local=createRequire(file)
 const status={...structuredClone(fixture.responses['/membership']),supported:true,active:kind==='active',status:kind==='active'?'active':kind==='expired'?'expired':'free',expires_at:kind==='active'?Math.floor(Date.now()/1000)+30*86400:kind==='expired'?1791986400:null}
 Object.assign(status,overrides)
 if(kind==='unsupported')status.supported=false
 vm.runInNewContext(read('pages/'+name+'/index.js'),{require:n=>n.endsWith('/member')?{...member,wrap:d=>d,load:async()=>status}:n.endsWith('/api')?{request:async()=>({})}:n.endsWith('/navigation')?{navigate(){},resetNavigation(){}}:local(n),Page:d=>definition=d,getApp:()=>({globalData:{token:'isolated-member-tools'},requireSession:()=>true}),wx:{},console})
 const p={...definition,data:structuredClone(definition.data),_visible:true,_seq:1,setData(patch){Object.assign(this.data,patch)}}
 if(name==='membership')await p.load()
 else{
  const user=fixture.responses['/auth/me'].user,summary=fixture.responses['/ledger/statistics?month=2026-10'].summary
  p.setData({...require('../miniprogram/utils/profile').avatarState(user),user,loading:false,statsLoading:false,...require('../miniprogram/utils/me-overview').readOverview(fixture.responses['/stats']),accountDays:require('../miniprogram/utils/me-overview').readAccountAge(fixture.responses['/auth/me']),heldAmountDisplay:fixture.responses['/stats'].held_purchase_total,cashLoading:false,cashEnabled:true,cash:[{key:'expense',display:'¥'+summary.expense,label:'支出'},{key:'income',display:'¥'+summary.income,label:'收入'},{key:'net',display:'¥'+summary.net,label:'净支出'}],memberSupported:status.supported,memberActive:status.active})
  if(kind==='loading')p.onMembershipRefreshStart();else if(kind==='error')p.onMembershipRefreshError();else p.onMembershipRefreshSuccess(status)
 }
 return p.data
}
async function renderer(page){
 const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start)
 await new Function('page','return(async()=>{'+helper.slice(start,end).replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')+'})()')(page)
}
async function render(page,name,data,width,large){
 let template=read('pages/'+name+'/index.wxml').replace(/<(view|block|image|input|canvas|checkbox|progress|paper-background|cat-loading|cat-feedback)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(scroll-view|checkbox-group|view|picker|block|text|image)(?=[\s>])/g,(_,pre,tag)=>pre+({'scroll-view':'wx-scroll','checkbox-group':'div',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[tag]))
 const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img').replace(/\bscroll-view\b/g,'wx-scroll')+'\nwx-scroll{display:block;overflow-x:auto;max-width:100%}button{cursor:default}'
 await page.setViewportSize({width,height:844});await page.evaluate(args=>render(...args),[template,styles,data,base])
 if(large)await page.evaluate(()=>{const nodes=[...document.querySelectorAll('.page div,.page span,.page button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);nodes.forEach(([n,size])=>n.style.fontSize=size*1.3+'px')})
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))))
 return page.evaluate(()=>({width:innerWidth,bodyWidth:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),overflow:[...document.querySelectorAll('.member-entry,.member-tool-menu,.member-feature,.member-entry-copy,.menu-copy')].filter(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||n.scrollWidth>n.clientWidth+2}).map(n=>n.className),tools:[...document.querySelectorAll('.member-tool-menu')].map(n=>n.id),card:document.querySelector('.member-entry')?.className,text:document.querySelector('.member-entry')?.textContent}))
}
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preview.html'),'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(path.join(out,'preview.html')).href);await renderer(page)
  for(const kind of ['free','active','expired','loading','error','unsupported']){
   const data=await state('me',kind);data.memberToolsExpanded=true
   for(const[width,large]of ['free','active','expired'].includes(kind)?[[320,false],[390,false],[430,false],[768,false],[320,true],[390,true]]:[[390,false]]){
    const audit=await render(page,'me',data,width,large),name=`me-${kind}-${width}${large?'-large':''}`
    if(audit.bodyWidth>width+1||audit.broken.length||audit.overflow.length||audit.tools.length!==4)throw Error(name+' '+JSON.stringify(audit))
    await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});checks.push({name,...audit})
    if(width===390&&!large&&['free','active','expired'].includes(kind)){
     const clip=await page.evaluate(()=>{const a=document.querySelector('.member-entry').getBoundingClientRect(),b=document.querySelector('.member-tools-group').getBoundingClientRect();return {left:0,top:Math.max(0,Math.floor(a.top)-8),width:390,height:Math.ceil(b.bottom-a.top)+20}})
     await sharp(path.join(out,name+'.png')).extract(clip).png().toFile(path.join(out,'me-'+kind+'-section.png'))
    }
   }
  }
  const subscription=await state('membership','free')
  for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   const audit=await render(page,'membership',subscription,width,large),name=`subscription-${width}${large?'-large':''}`
   if(audit.bodyWidth>width+1||audit.broken.length||audit.overflow.length)throw Error(name+' '+JSON.stringify(audit))
   await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});checks.push({name,...audit})
  }
  for(const density of [2,3]){
   const context=await browser.newContext({deviceScaleFactor:density,viewport:{width:390,height:844}}),dense=await context.newPage()
   await dense.goto(pathToFileURL(path.join(out,'preview.html')).href);await renderer(dense)
   const audit=await render(dense,'membership',subscription,390,false)
   await dense.locator('.member-rights-heading').scrollIntoViewIfNeeded();await dense.screenshot({path:path.join(out,`subscription-${density}x.png`),fullPage:true});checks.push({name:'subscription-density-'+density,...audit});await context.close()
  }
  const composites=[],panelWidth=390,gap=16;let height=0
  for(const[kind,i]of ['free','active','expired'].map((k,i)=>[k,i])){
   const input=path.join(out,'me-'+kind+'-section.png'),metadata=await sharp(input).metadata();height=Math.max(height,metadata.height)
   composites.push({input,left:gap+i*(panelWidth+gap),top:48})
  }
  const title=Buffer.from('<svg width="1234" height="45"><style>text{font:18px Microsoft YaHei;fill:#333}</style><text x="18" y="30">未开通</text><text x="424" y="30">已开通 · 暖金会员证</text><text x="830" y="30">已到期</text></svg>')
  await sharp({create:{width:panelWidth*3+gap*4,height:height+64,channels:4,background:'#F6F6F6'}}).composite([{input:title,left:0,top:0},...composites]).png().toFile(path.join(out,'me-states-comparison.png'))
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,fixtureOnly:true,nativeRuntime:false,realDeviceTested:false,remoteWrites:0,deployed:false},null,2))
  console.log('Passed '+checks.length+' membership card/tool layout and pixel-density cases')
 }finally{await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1})
module.exports={state,renderer,render}
