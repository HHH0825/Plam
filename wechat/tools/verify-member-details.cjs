// Actual WXML/WXSS and page controllers, backed by isolated fixture responses.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/member-details-20261016')
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/member-fixture.json'),'utf8')).responses
async function model(name,kind='active',extra={}){
 let definition;const file=path.join(root,'pages',name,'index.js'),local=createRequire(file),app={globalData:{token:'isolated-refine'},requireSession:()=>true}
 const status={...structuredClone(fixture['/membership']),supported:true,active:kind==='active',status:kind==='active'?'active':kind==='expired'?'expired':'free',payment_open:false,purchase_allowed:false,expires_at:kind==='active'?1798761600:kind==='expired'?1791907200:null,server_time:1792123200}
 const api={request:async url=>{let result=fixture[url]||fixture[url.split('?')[0]];if(url.startsWith('/member/budget'))result=extra.budgetResponse||fixture['/member/budget?month=2026-10&book_id=all'];if(!result)throw Error('No fixture: '+url);return structuredClone(result)}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/member')?{...require('../miniprogram/utils/member'),wrap:d=>d,load:async()=>status,ensure:async()=>kind==='active'}:n.endsWith('/api')?api:n.endsWith('/navigation')?{resetNavigation(){},navigate(){}}:local(n),Page:d=>definition=d,getApp:()=>app,wx:{setNavigationBarTitle(){},disableAlertBeforeUnload(){},enableAlertBeforeUnload(){},showToast(){}},console,setTimeout,clearTimeout})
 const page={...definition,data:structuredClone(definition.data),_visible:true,_seq:1,setData(patch){for(const[k,v]of Object.entries(patch)){const keys=k.split('.');let obj=this.data;while(keys.length>1){const key=keys.shift();obj=obj[key]||(obj[key]={})}obj[keys[0]]=v}}}
 page.onLoad?.({mode:extra.mode||'books',month:'2026-10'});await page.load();Object.assign(page.data,extra)
 return page
}
async function reportImage(page,type,appearance){
 const sources=Object.fromEntries(fs.readdirSync(path.join(root,'utils')).filter(n=>n.endsWith('.js')).map(n=>['utils/'+n,fs.readFileSync(path.join(root,'utils',n),'utf8')]))
 sources['config.js']=fs.readFileSync(path.join(root,'config.js'),'utf8')
 const result=await page.evaluate(async({sources,base,type,appearance})=>{
  const cache={};function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};function relative(n){const parts=(id.slice(0,id.lastIndexOf('/')+1)+n).split('/'),out=[];for(const p of parts)if(p==='..')out.pop();else if(p!=='.'&&p)out.push(p);return load(out.join('/')+(n.endsWith('.js')?'':'.js'))}new Function('require','module','exports',sources[id])(relative,module,module.exports);return module.exports}
  window.wx={getSystemInfoSync:()=>({platform:'android'})};window.getApp=()=>({globalData:{token:''}})
  const demo=load('utils/appearance-preview.js'),engine=load(type==='cash'?'utils/ledger-report-image.js':'utils/report-image.js'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')
  const layout=type==='cash'?engine.plan(ctx,demo.cashModel,false,1,appearance):engine.planReport(ctx,demo.collectionReport,{},appearance)
  canvas.width=layout.width;canvas.height=layout.height;const images=new Map()
  await Promise.all([...new Set(layout.commands.filter(c=>c.src).map(c=>c.src))].map(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images.set(src,img);resolve()};img.onerror=()=>reject(Error('missing '+src));img.src=base+src})))
  if(type==='cash')engine.draw(ctx,layout,Object.fromEntries(images));else engine.drawLayout(ctx,layout,images)
  return canvas.toDataURL('image/png').split(',')[1]
 },{sources,base:pathToFileURL(root).href,type,appearance})
 const file=path.join(out,'report-'+type+'.png');fs.writeFileSync(file,Buffer.from(result,'base64'));return pathToFileURL(file).href
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(entry).href);await helper.renderer(page)
  const books=await model('member-tools');await books.newBook();books.bookInput({currentTarget:{dataset:{field:'name'}},detail:{value:'周末旅行手记'}});books.coverChange({detail:{value:'1'}});books.bookSticker({detail:{value:'2'}})
  const keyboard=await model('member-tools');keyboard.bookWindowHeight=()=>700;await keyboard.newBook();keyboard.bookFocus({currentTarget:{dataset:{field:'name'}},detail:{height:300}})
  const appearance=await model('member-tools','active',{mode:'appearance'});appearance.chooseAppearance({currentTarget:{dataset:{field:'theme',id:'sage'}}});appearance.chooseAppearance({currentTarget:{dataset:{field:'template',id:'journal'}}});appearance.chooseAppearance({currentTarget:{dataset:{field:'sticker',id:'cat'}}})
  const reports={cash:await reportImage(page,'cash',appearance.data.appearance),collection:await reportImage(page,'collection',appearance.data.appearance)}
  const variants=[['book-preview','member-tools',books.data],['book-keyboard','member-tools',keyboard.data],['comparison-terms','member-benefits',{...(await model('member-benefits')).data,serviceExpanded:true}]]
  for(const tab of ['page','cash','collection'])variants.push(['appearance-'+tab,'member-tools',{...structuredClone(appearance.data),appearancePreviewTab:tab,appearancePreviewPath:reports[tab]||'',appearancePreviewLoading:false,appearancePreviewError:''}])
  for(const expanded of [false,true])variants.push(['me-'+(expanded?'expanded':'collapsed'),'me',{...await helper.state('me','active'),memberToolsExpanded:expanded}])
  for(const[label,name,data]of variants)for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   const audit=await helper.render(page,name,data,width,large);assert.equal(audit.bodyWidth,width,label+' overflow');assert.deepEqual(audit.broken,[],label+' missing art');assert.deepEqual(audit.overflow,[])
   if(label.startsWith('appearance')){const report=data.appearancePreviewTab!=='page';assert.equal(await page.locator('.template-option').count(),report?3:0);assert.equal(await page.locator('.sticker-option').count(),report?7:0);assert.equal(await page.locator('.appearance-chip').count(),4);assert.match(await page.locator('.appearance-context').textContent(),data.appearancePreviewTab==='page'?/页面效果/:data.appearancePreviewTab==='cash'?/收支小报/:/收藏小报/)}
   if(name==='me'){
    const positions=await page.evaluate(()=>({card:document.querySelector('.member-entry').getBoundingClientRect().bottom,heads:[...document.querySelectorAll('.section-head')].map(n=>({text:n.textContent,top:n.getBoundingClientRect().top})),tools:document.querySelector('.member-tools-heading').getBoundingClientRect().height}));assert.deepEqual(positions.heads.slice(-3).map(x=>x.text.includes('收藏册')?'收藏册':x.text.includes('会员工具')?'会员工具':'一起做好'),['收藏册','会员工具','一起做好']);assert.ok(positions.tools>=44);assert.ok(positions.heads.slice(-3)[0].top-positions.card<=14);assert.equal(await page.locator('.member-tool-menu').count(),data.memberToolsExpanded?4:0)
   }
   if(label.startsWith('book')){
    await page.locator('.book-sheet-scroll').evaluate(n=>n.style.overflowY='auto')
    const box=await page.locator('.book-name-input').boundingBox();await page.locator('.book-name-input').focus();assert.deepEqual(await page.locator('.book-name-input').boundingBox(),box);assert.equal(await page.locator('.book-preview').count(),1)
    const geometry=await page.locator('.book-edit-sheet').evaluate(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,top:n.getBoundingClientRect().top}));assert.ok(geometry.left>=0&&geometry.right<=width+1&&geometry.top>=0)
    if(label==='book-preview')assert.equal(await page.locator('.book-preview .book-name').textContent(),'周末旅行手记')
   }
   if(name==='member-benefits'){const text=await page.locator('body').textContent();assert.doesNotMatch(text,/安卓退款|App Store|其他有效授权保留/);assert.match(text,/到期不会删除已有记录/)}
   await page.screenshot({path:path.join(out,label+'-'+width+(large?'-large':'')+'.png'),fullPage:true});checks.push({label,width,large,passed:true})
  }
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,isolated:true,remoteWrites:0,realPayments:0,realDevice:false},null,2));console.log(JSON.stringify({passed:true,layoutChecks:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
