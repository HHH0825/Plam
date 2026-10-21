// Actual WXML/WXSS, isolated data, no backend requests. Browser evidence is not device evidence.
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm')
const {createRequire}=require('node:module'), {pathToFileURL}=require('node:url'), {chromium}=require('playwright')
const {decorate}=require('../miniprogram/utils/view'), {welcomeLayout}=require('../miniprogram/pages/login/lib/layout'), {avatarState}=require('../miniprogram/utils/profile')
const root=path.resolve(__dirname,'../miniprogram'), out=path.resolve(__dirname,'../docs/images/dots-glass-20261011'), scratch=path.resolve(__dirname,'../.qa-dots-glass')
const read=f=>fs.readFileSync(path.join(root,f),'utf8'), base=pathToFileURL(root).href
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
function markup(f){return read(f).replace(/<include src="([^"]+)"\s*\/>/g,(_,s)=>markup(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
function definition(name){let result={};const file=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:v=>{result=v},wx:{},getApp:()=>({globalData:{}})});return result}
const user={id:990082,username:'微信用户1',avatar_key:'cat'}, item=decorate({id:1,name:'陪我旅行的相机',category:'数码',icon_type:'digital',status:'active',holding_days:365,purchase_price:'1280.00',purchase_date:'2025-10-11',net_cost:'467.20',daily_net_cost:'1.28',daily_purchase_cost:'3.50',maintenance_total:'0.00',fixed_expense_total:'0.00',disposal_proceeds:'0.00',storage_location_name:'书桌抽屉',notes:'一起记录生活的小片段。'})
const rows=[item,decorate({...item,id:2,name:'常用的马克杯',status:'idle',holding_days:126,daily_net_cost:'0.16'})]
function scope(name,width,patch){const data={...definition(name).data,loading:false,error:'',busy:false}
 if(name==='login')Object.assign(data,welcomeLayout({windowWidth:width,windowHeight:788}))
 if(name==='items'||name==='disposed')Object.assign(data,{items:rows,shown:rows.map(r=>name==='disposed'?{...r,status:'disposed',statusText:'已处置'}:r),categories:['全部分类','数码'],draftCategories:['全部分类','数码']})
 if(name==='me')Object.assign(data,{user,...avatarState(user),statsLoading:false,statsError:'',heldItems:'2',heldAmount:'1,299.90',accountDays:'128',statsCompatible:true,ageCompatible:true})
 if(name==='item')Object.assign(data,{item,photoLoading:false,photoUnavailable:false,artFailed:false})
 if(name==='profile')Object.assign(data,{user,name:user.username,loaded:true,...avatarState(user)})
 if(name==='insights')Object.assign(data,{statsLoading:false,cardsLoading:false,monthlyLoading:false})
 if(name==='fixed-expenses')Object.assign(data,{listReady:true,itemsReady:true})
 if(name==='storage-locations')Object.assign(data,{ready:true,locations:[{id:1,name:'书桌抽屉',item_count:2}],shownLocations:[{id:1,name:'书桌抽屉',item_count:2}]})
 if(name==='monthly')Object.assign(data,{month:'2026-10',maxMonth:'2026-10'})
 return {...data,...patch}
}
async function main(){fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body></body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
 await page.evaluate(()=>{window.render=(template,css,scope,base)=>{
  document.querySelectorAll('style').forEach(n=>n.remove());const style=document.createElement('style');style.textContent=css+'\nbody{margin:0} wx-block{display:contents} img{object-fit:contain} .thumbnail{object-fit:cover} button,input,textarea{font-family:inherit;box-sizing:border-box} button{border:0} input{border:0;background:transparent;outline:none} .native-bar{height:56px;background:white;display:flex;align-items:center;justify-content:center}';document.head.append(style)
  const container=document.createElement('div');container.innerHTML=template
  const val=(s,e)=>new Function('s','with(s){return ('+e+')}')(new Proxy(s,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:o[k]})), interp=(s,t)=>t.replace(/{{([\s\S]*?)}}/g,(_,e)=>String(val(s,e)??''))
  function children(parent,s){let matched=false;for(const node of [...parent.childNodes]){
   if(node.nodeType===3){node.textContent=interp(s,node.textContent);continue}if(node.nodeType!==1)continue
   const loop=node.getAttribute('wx:for');if(loop){const alias=node.getAttribute('wx:for-item')||'item',ix=node.getAttribute('wx:for-index')||'index';node.removeAttribute('wx:for');for(const[index,item]of val(s,loop.slice(2,-2)).entries()){const holder=document.createElement('div');holder.append(node.cloneNode(true));children(holder,{...s,[ix]:index,[alias]:item});node.before(...holder.childNodes)}node.remove();continue}
   const cond=node.getAttribute('wx:if'),alt=node.getAttribute('wx:elif'),otherwise=node.hasAttribute('wx:else');if(cond!==null){matched=!!val(s,cond.slice(2,-2));if(!matched){node.remove();continue}}else if(alt!==null){const ok=!matched&&!!val(s,alt.slice(2,-2));matched||=ok;if(!ok){node.remove();continue}}else if(otherwise){if(matched){node.remove();continue}matched=true}else matched=false
   for(const attr of [...node.attributes]){if(attr.name.startsWith('wx:'))node.removeAttribute(attr.name);else{let v=interp(s,attr.value);if(attr.name==='src'&&(v.startsWith('/assets/')||/^\/pages\/[^/]+\/assets\//.test(v)))v=base+v;if(['disabled','hidden'].includes(attr.name)&&v==='false')node.removeAttribute(attr.name);else node.setAttribute(attr.name,v)}}
   if(node.tagName==='PAPER-BACKGROUND'){node.remove();continue}
   if(node.tagName==='INPUT')node.value=node.getAttribute('value')||'';if(node.tagName==='TEXTAREA')node.textContent=node.getAttribute('value')||''
   children(node,s)
  }}children(container,scope);document.body.replaceChildren(...container.childNodes);scrollTo(0,0)
 }})
 await require('./white-nav-preview.cjs')(page,root)
 async function capture(name,width,tag='',patch={},large=false){await page.setViewportSize({width,height:844})
  const template=markup('pages/'+name+'/index.wxml').replace(/<(view|block|image|input|textarea)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|picker|scroll-view)(?=[\s>])/g,'div').replace(/\bblock(?=[\s>])/g,'wx-block').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
  const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')
  await page.evaluate(args=>render(...args),[template,styles,scope(name,width,patch),base])
  await page.evaluate(({name,base,filter})=>{const bar=document.createElement('div');bar.className='native-bar';bar.textContent=name==='me'?'我的':name==='items'?'猫爪物帐':name==='login'?'猫爪物账':'‹';document.body.prepend(bar);if(['items','me'].includes(name)&&!filter)mountWhiteNav(name==='me'?1:0,base)}, {name,base,filter:patch.filterOpen})
  if(large)await page.evaluate(()=>{const list=[...document.querySelectorAll('.page div,.page span,.page button,.page input,.page textarea')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);list.forEach(([n,size])=>n.style.fontSize=size*1.3+'px')})
  await page.evaluate(()=>{const row=document.querySelector('.purchase-entries');if(row){const buttons=[...row.querySelectorAll('button')];if(buttons.some(b=>b.querySelector('span').getBoundingClientRect().width+24+5+18>b.getBoundingClientRect().width))row.classList.add('entries-stacked')}})
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
  const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,bg:getComputedStyle(document.body).backgroundImage.startsWith('url("data:image/png;base64,'),rootFill:getComputedStyle(document.querySelector('.page')).backgroundColor,failed:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),dirtyCards:[...document.querySelectorAll('.card,input,textarea,.filter-sheet,.storage-target')].filter(n=>getComputedStyle(n).backgroundImage!=='none').map(n=>n.className),blur:document.querySelector('.glass-surface')&&getComputedStyle(document.querySelector('.glass-surface')).backdropFilter}))
  checks.push({name,width,tag,large,...result});if(result.overflow||!result.bg||result.rootFill!=='rgba(0, 0, 0, 0)'||result.failed.length||result.dirtyCards.length)throw Error(JSON.stringify(checks.at(-1)))
  const label=name+'-'+width+(tag?'-'+tag:'');await page.screenshot({path:path.join(out,label+'.png'),fullPage:true})
  return label
 }
 const names=JSON.parse(read('app.json')).pages.map(p=>p.split('/')[1]);for(const name of names)for(const width of [320,390,430,768])await capture(name,width)
 for(const name of names)await capture(name,320,'large-font',{},true)
 await capture('items',390,'filter',{filterOpen:true});await capture('item',390,'expanded',{factsExpanded:true})
 await capture('login',320,'short',{...welcomeLayout({windowWidth:320,windowHeight:504})})
 // High-frequency color bars under the actual navigation distinguish blur from translucency.
 await capture('items',390,'scroll')
 await page.evaluate(()=>{const pattern=document.createElement('div');pattern.id='blur-probe';pattern.style.cssText='height:300px;background:repeating-linear-gradient(90deg,#175b97 0 8px,#df5579 8px 16px,#ffce39 16px 24px);margin-top:12px';document.querySelector('.page').append(pattern);scrollTo(0,document.documentElement.scrollHeight-844-100)})
 await page.screenshot({path:path.join(out,'glass-blur-on.png')})
 const material=await page.evaluate(()=>{const pattern=document.querySelector('#blur-probe').getBoundingClientRect(),bar=document.querySelector('.tab-bar').getBoundingClientRect();return {fill:getComputedStyle(document.querySelector('.glass-surface')).backgroundColor,blur:getComputedStyle(document.querySelector('.glass-surface')).backdropFilter,hit:document.elementFromPoint(195,800)?.closest('button')?.className,contentBehind:pattern.top<bar.top&&pattern.bottom>bar.bottom}})
 if(material.fill!=='rgba(255, 255, 255, 0.58)'||material.blur!=='blur(20px) saturate(1.2)'||material.hit!=='add'||!material.contentBehind)throw Error(JSON.stringify(material))
 await page.evaluate(()=>document.querySelector('.tab-bar').classList.add('glass-no-blur'));await page.screenshot({path:path.join(out,'glass-blur-off.png')})
 await page.evaluate(()=>document.querySelector('.tab-bar').classList.add('glass-fallback'));await page.screenshot({path:path.join(out,'glass-fallback.png')})
 const fallback=await page.evaluate(()=>getComputedStyle(document.querySelector('.glass-surface')).backgroundColor);if(fallback!=='rgba(255, 255, 255, 0.95)')throw Error('Fallback fill incorrect')
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,cases:checks.length,checks,material,fallback,remoteWrites:0,native:false},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
