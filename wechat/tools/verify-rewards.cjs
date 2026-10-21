// Browser layout evidence renders production WXML, WXSS and generated assets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/rewards-20261017')
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/rewards-fixture.json'),'utf8')).responses
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
function css(file){return read(file).replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))))}
function markup(file){return read(file).replace(/<include\s+src="([^"]+)"\s*\/>/g,(_,p)=>markup(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))))}
function transform(t){return t.replace(/<cat-feedback\b[^>]*\/>/g,'').replace(/<cat-loading\b[^>]*\/>/g,'').replace(/<(view|block|image|page-meta)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(view|block|text|image|scroll-view)(?=[\s>])/g,(_,pre,t)=>pre+({view:'div',block:'wx-block',text:'span',image:'img','scroll-view':'wx-scroll'}[t]))}
function styles(text){return text.replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img').replace(/:host\s*\{[^}]*\}/g,'')}
async function render(page,file,data,width,large){
 const template=transform(markup(file+'.wxml')),sheet=styles(css('app.wxss')+'\n'+css(file+'.wxss'))+'\nwx-scroll{display:block;overflow:auto}body{background-color:#fffdf6} .native-bar{position:relative;height:55px;background:white;display:flex;align-items:center;justify-content:center;font-size:16px}'
 await page.setViewportSize({width,height:844});await page.evaluate(args=>window.render(...args),[template,sheet,data,pathToFileURL(root).href])
 if(large)await page.evaluate(()=>{const rows=[...document.querySelectorAll('div,span,button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);rows.forEach(([n,size])=>n.style.fontSize=size*1.3+'px')})
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
}
async function audit(page,label){const r=await page.evaluate(()=>({width:innerWidth,bodyWidth:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),overflow:[...document.querySelectorAll('.rewards-card,.seed-wallet,.cat-dialog,.exchange-dialog')].filter(n=>n.getBoundingClientRect().left<0||n.getBoundingClientRect().right>innerWidth+.5||n.scrollWidth>n.clientWidth+2).map(n=>n.className),smallButtons:[...document.querySelectorAll('button')].filter(n=>!n.closest('.member-order-actions')&&n.getBoundingClientRect().height<43.5).map(n=>({class:n.className,height:n.getBoundingClientRect().height}))}));assert.ok(r.bodyWidth<=r.width+1,label+JSON.stringify(r));assert.deepEqual(r.broken,[],label);assert.deepEqual(r.overflow,[],label);assert.deepEqual(r.smallButtons,[],label);return r}
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preview.html'),'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']}),checks=[]
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(path.join(out,'preview.html')).href);await helper.renderer(p)
  const model=fixture['/rewards'],days=model.checkin.days.map((d,i)=>({...d,label:['周一','周二','周三','周四','周五','周六','周日'][i]})),base={model,days,inviteCode:model.invitation.code,loading:false,busy:false,error:'',inviteError:'',exchangeOpen:false,memberThemeStyle:'',memberThemeClass:''}
  for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true],[390,true]]){
   for(const[kind,patch]of [['ready',{}],['claimed',{model:{...model,checkin:{...model.checkin,today_claimed:true}}}],['max',{model:{...model,capacity:{...model.capacity,extra:200,free_limit:220},shop:{...model.shop,next_price:null}}}],['error',{error:'读取失败，请检查网络后重试。'}],['exchange',{exchangeOpen:true,exchange:{extra:0,price:60,balance:120,before:20,after:21,remaining:60}}]]){
    await render(p,'pages/rewards/index',{...base,...patch},width,large);const name=`shop-${kind}-${width}${large?'-large':''}`;checks.push({name,...await audit(p,name)});await p.screenshot({path:path.join(out,name+'.png'),fullPage:!patch.exchangeOpen})
    if(width===390&&!large&&kind==='ready'){await p.screenshot({path:path.join(out,'shop-top-390.png')});await p.locator('.shop-heading').evaluate(n=>n.scrollIntoView({block:'start'}));await p.screenshot({path:path.join(out,'shop-capacity-390.png')})}
   }
   for(const kind of ['greeting','capacity','signed-greeting']){
    const value={...model,checkin:{...model.checkin,today_claimed:kind==='signed-greeting'}}
    await render(p,'components/cat-feedback/index',{working:false,greetingOpen:kind!=='capacity',capacityOpen:kind==='capacity',model:value,capacity:model.capacity,greetingArt:'/assets/rewards/good-night.png',sunny:false},width,large)
    await p.waitForTimeout(260);const name=`${kind}-${width}${large?'-large':''}`;checks.push({name,...await audit(p,name)});await p.screenshot({path:path.join(out,name+'.png')})
   }
  }
  for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   const plans=[{id:'month',name:'月会员',price:'3.9',unit:'月'},{id:'quarter',name:'季会员',price:'9.9',unit:'季'}]
   await render(p,'pages/membership/index',{loading:false,error:'',memberThemeStyle:'',memberThemeClass:'',promotion:null,feedbackMessage:'',membership:{supported:true,active:false,payment_open:false,purchase_allowed:false},plans,selected:'month',selectedPlan:plans[0],expiry:'',buying:false,paymentNote:'',announcementOpen:false,features:[{mode:'books',icon:'/assets/membership/books.png',title:'我的账本',note:'多账本与流水整理'},{mode:'budgets',icon:'/assets/membership/budget.png',title:'月度预算',note:'总预算与分类预算'}]},width,large)
   const name=`membership-${width}${large?'-large':''}`;checks.push({name,...await audit(p,name)})
   assert.deepEqual(await p.locator('.member-feature-title').allTextContents(),['免小程序内广告','无限容量','我的账本','月度预算'])
   assert.equal(await p.locator('button.member-capacity-benefit').count(),0)
   await p.screenshot({path:path.join(out,name+'.png'),fullPage:true})
  }
  const me=await helper.state('me','active');me.meSeeds=120;me.memberToolsExpanded=false
  await helper.render(p,'me',me,390,false)
  const order=await p.locator('.settings-group .menu-title').allTextContents();assert.deepEqual(order,['签到与喵铺','手账外观','个人设置']);checks.push({name:'me-menu-order',order,passed:true})
  assert.ok(await p.locator('.member-entry').count());assert.equal(await p.locator('[class*=member-scroll]').count(),0)
  await p.screenshot({path:path.join(out,'me-ready-390.png'),fullPage:true})
  await render(p,'components/cat-loading/index',{label:'小猫正在整理中…',compact:false,paw:false,reduced:false,reducedMotion:false,visible:true},390,false)
  await p.evaluate(()=>{document.body.style.background='white';document.body.style.paddingTop='180px'})
  for(let i=0;i<12;i++){
   await p.evaluate(i=>{for(const a of document.getAnimations()){a.pause();a.currentTime=i*150}},i)
   await p.screenshot({path:path.join(out,`loading-${String(i).padStart(2,'0')}.png`)})
  }
  const transforms=[]
  for(const ms of [0,600,1200]){await p.evaluate(ms=>{for(const a of document.getAnimations()){a.pause();a.currentTime=ms}},ms);transforms.push(await p.locator('.cat-loader-strip').evaluate(n=>getComputedStyle(n).transform))}
  assert.equal(new Set(transforms).size,3);checks.push({name:'loading-three-distinct-frames',transforms,passed:true})
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,fixtureOnly:true,cloudWrites:0,realDevice:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}))
 }finally{await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1})
module.exports={render,audit}
