// Uses actual WXML/WXSS and report drawing code with isolated API fixtures.
// Browser evidence only; this does not pretend to be a physical WeChat device.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,process.env.MEMBER_VISUAL_OUTPUT||'../docs/images/membership-20261015'),fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/member-fixture.json'),'utf8'))
const member=require('../miniprogram/utils/member'),ledger=require('../miniprogram/utils/ledger')
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),base=pathToFileURL(root).href
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
async function state(name,mode,free=false){let definition;const file=path.join(root,'pages',name,'index.js'),local=createRequire(file),status={...structuredClone(fixture.responses['/membership']),supported:true};if(free)Object.assign(status,{active:false,status:'free',expires_at:null,entitlements:[]})
 if(mode==='expired')Object.assign(status,{active:false,status:'expired',expires_at:1791986400,entitlements:[]})
 const api={request:async p=>structuredClone(p==='/membership'?status:fixture.responses[p]||fixture.responses[p.split('?')[0]]||{})}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/api')?api:n.endsWith('/member')?{...member,wrap:d=>d,load:async()=>status,ensure:async()=>!free}:n.endsWith('/navigation')?{navigate(){},resetNavigation(){}}:local(n),Page:d=>definition=d,wx:{setNavigationBarTitle(){}},getApp:()=>({globalData:{token:'isolated-member-browser'},requireSession:()=>true}),console})
 const p={...definition,_visible:true,_seq:1,data:structuredClone(definition.data),setData(patch){for(const[k,v]of Object.entries(patch)){const parts=k.split('.');let r=this.data;while(parts.length>1){const part=parts.shift();r=r[part]||(r[part]={})}r[parts[0]]=v}}}
 if(name==='me'){
  const user=fixture.responses['/auth/me'].user,summary=fixture.responses['/ledger/statistics?month=2026-10'].summary
  p.setData({...require('../miniprogram/utils/profile').avatarState(user),user,loading:false,statsLoading:false,...require('../miniprogram/utils/me-overview').readOverview(fixture.responses['/stats']),accountDays:require('../miniprogram/utils/me-overview').readAccountAge(fixture.responses['/auth/me']),heldAmountDisplay:fixture.responses['/stats'].held_purchase_total,cashLoading:false,cashEnabled:true,cash:[{key:'expense',display:'¥'+summary.expense,label:'支出'},{key:'income',display:'¥'+summary.income,label:'收入'},{key:'net',display:'¥'+summary.net,label:'净收入'}]})
 }else if(name==='membership')await p.load();else{p.onLoad({mode,month:'2026-10'});await p.load();if(mode==='analysis'&&!free){p.setData({filters:{...p.data.filters,...fixture.filters}});await p.runAnalysis()}if(mode==='appearance'){p.chooseAppearance({currentTarget:{dataset:{field:'theme',id:'sage'}}});p.chooseAppearance({currentTarget:{dataset:{field:'template',id:'journal'}}});p.chooseAppearance({currentTarget:{dataset:{field:'sticker',id:'cat'}}})}}
 if(p.data.error)throw Error(p.data.error);return {...p.data,memberThemeStyle:'--member-accent:#FFE15A;--member-soft:#FFF9DE;'}
}
async function main(){fs.mkdirSync(out,{recursive:true});const file=path.join(out,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
 const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start)
 await new Function('page','return(async()=>{'+helper.slice(start,end).replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')+'})()')(page)
 for(const [name,mode,free]of [['membership','subscription',true],['membership','active',false],['membership','expired',false],['me','me-entry',true],...['books','analysis','budgets','bills','appearance'].map(m=>['member-tools',m,false])]){
  const data=await state(name,mode,free)
  let template=read('pages/'+name+'/index.wxml').replace(/<(view|block|image|input|canvas|checkbox|progress)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(scroll-view|checkbox-group|view|picker|block|text|image)(?=[\s>])/g,(_,pre,tag)=>pre+({'scroll-view':'wx-scroll','checkbox-group':'div',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[tag]))
  const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img').replace(/\bscroll-view\b/g,'wx-scroll')+'\nwx-scroll{display:block;overflow-x:auto;max-width:100%}checkbox{display:inline-block;width:16px;height:16px;border:1px solid #AFAFAF;border-radius:3px;flex:none}input{min-height:24px;width:100%;font-size:inherit}progress{display:block;height:7px;background:#EEE;border-radius:8px}button{cursor:default} .native-bar{font-size:14px;position:relative} .native-bar:before{content:"‹";position:absolute;left:18px;font-size:24px}'
  for(const [width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   const variant=structuredClone(data)
   if(mode==='books'&&large)variant.books[1].name='一份名字比较长的家庭旅行与爱好收藏账本'
   if(mode==='budgets'&&large)variant.budget.total.remainingText='999,999,999.00'
   await page.setViewportSize({width,height:844});await page.evaluate(args=>render(...args),[template,styles,variant,base]);await page.evaluate(title=>{const bar=document.createElement('div');bar.className='native-bar';bar.textContent=title;if(title==='猫爪会员')bar.style.background='#FFF9E8';document.body.prepend(bar)},name==='membership'?'猫爪会员':name==='me'?'我的':data.title)
   if(large)await page.evaluate(()=>{const rows=[...document.querySelectorAll('.page div,.page span,.page button,.page input')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);rows.forEach(([n,size])=>n.style.fontSize=size*1.3+'px')})
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
   const audit=await page.evaluate(()=>({width:innerWidth,bodyWidth:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),closed:document.querySelector('.member-purchase button')?.disabled,prices:[...document.querySelectorAll('.member-price')].map(n=>n.textContent),cards:[...document.querySelectorAll('.card,.member-plan,.member-feature,.member-free,.member-purchase')].filter(n=>n.getBoundingClientRect().right>innerWidth+1||n.getBoundingClientRect().left<0).map(n=>n.className)}))
   if(audit.bodyWidth>width+1||audit.broken.length||audit.cards.length)throw Error(mode+' '+width+' '+large+' '+JSON.stringify(audit))
   if(name==='membership'&&(!audit.closed||audit.prices.join('|')!=='¥3.9|¥9.9|¥29.9'))throw Error('Subscription price or disabled button mismatch '+JSON.stringify(audit))
   if(name==='membership'){
    const appearance=await page.evaluate(()=>({buttonBackground:getComputedStyle(document.querySelector('.member-purchase button')).backgroundImage,priceOverflow:[...document.querySelectorAll('.member-price text,.member-price span')].filter(n=>{const a=n.getBoundingClientRect(),b=n.closest('.member-plan').getBoundingClientRect();return a.left<b.left+1||a.right>b.right-1}).map(n=>n.textContent)}))
    if(!appearance.buttonBackground.includes('linear-gradient')||appearance.priceOverflow.length)throw Error('Closed CTA or enlarged price appearance mismatch '+JSON.stringify(appearance))
    Object.assign(audit,appearance)
   }
   const label=mode+'-'+width+(large?'-large':'');await page.screenshot({path:path.join(out,label+'.png'),fullPage:true});checks.push({label,...audit})
  }
 }
 // Draw both real report families with each new template; verify all assets load.
 const sources=Object.fromEntries(fs.readdirSync(path.join(root,'utils')).filter(n=>n.endsWith('.js')).map(n=>['utils/'+n,read('utils/'+n)]));sources['config.js']=read('config.js');sources['utils/api.js']="module.exports={request:async()=>window.memberFixture}"
 await page.evaluate(({sources,fixture})=>{
  window.getApp=()=>({globalData:{token:'isolated-report'}});window.wx={};window.memberFixture=fixture.responses['/membership'];const modules={}
  window.localRequire=function(name,from='utils/start.js'){const parts=from.split('/');parts.pop();for(const s of name.split('/')){if(s==='..')parts.pop();else if(s!=='.')parts.push(s)}let key=parts.join('/');if(!key.endsWith('.js'))key+='.js';if(modules[key])return modules[key].exports;const module={exports:{}};modules[key]=module;new Function('module','exports','require',sources[key])(module,module.exports,n=>localRequire(n,key));return module.exports}
 },{sources,fixture})
 for(const template of ['simple','journal'])for(const family of ['cash','collection']){
  const audit=await page.evaluate(async({template,family,fixture,base})=>{
   memberFixture.appearance.effective={theme:'sage',template,sticker:'cat'};const m=localRequire('./member');m.reset();await m.load(true)
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),cash=localRequire('./ledger-report-image'),item=localRequire('./report-image'),a=localRequire('./ledger-analytics')
   const model=family==='cash'?a.present(a.snapshot(fixture.responses['/ledger/statistics'],'2026-10','2026-10-15')):fixture.responses['/reports/monthly']
   const layout=family==='cash'?cash.plan(ctx,model):item.planReport(ctx,model);canvas.width=layout.width;canvas.height=layout.height;const images=new Map(),failed=[]
   await Promise.all([...new Set(layout.commands.filter(c=>c.src).map(c=>c.src))].map(src=>new Promise(r=>{const image=new Image();image.onload=()=>{images.set(src,image);r()};image.onerror=()=>{failed.push(src);r()};image.src=base+src})))
   if(family==='cash')cash.draw(ctx,layout,Object.fromEntries(images));else item.drawLayout(ctx,layout,images)
   document.body.replaceChildren(canvas);return {failed,height:layout.height,width:layout.width,template,family}
  },{template,family,fixture,base})
  if(audit.failed.length)throw Error(JSON.stringify(audit));await page.locator('canvas').screenshot({path:path.join(out,family+'-'+template+'-export.png')});checks.push(audit)
 }
 fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,source:'Actual WXML/WXSS and report code, offline API fixtures, browser rendering',nativeRuntime:false,realDeviceTested:false,remoteWrites:0,deployed:false},null,2));console.log('Passed '+checks.length+' browser layout/report cases')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
