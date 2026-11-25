// Actual WXML/WXSS and page controllers, backed by isolated fixture responses.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/book-comic-20261017')
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/book-comic-fixture.json'),'utf8')).responses
async function model(name,kind='active',extra={}){
 let definition;const file=path.join(root,'pages',name,'index.js'),local=createRequire(file),app={globalData:{token:'isolated-refine'},requireSession:()=>true}
 const status={...structuredClone(fixture['/membership']),supported:true,active:kind==='active',status:kind==='active'?'active':kind==='expired'?'expired':'free',payment_open:false,purchase_allowed:false,expires_at:kind==='active'?1798761600:kind==='expired'?1791907200:null,server_time:1792123200}
 const api={request:async url=>{let result=fixture[url]||fixture[url.split('?')[0]];if(url.startsWith('/member/budget'))result=extra.budgetResponse||fixture['/member/budget?month=2026-10&book_id=all'];if(!result)throw Error('No fixture: '+url);return structuredClone(result)}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/member')?{...require('../miniprogram/utils/member'),wrap:d=>d,load:async()=>status,ensure:async()=>kind==='active'}:n.endsWith('/api')?api:n.endsWith('/navigation')?{resetNavigation(){},navigate(){}}:local(n),Page:d=>definition=d,getApp:()=>app,wx:{setNavigationBarTitle(){},disableAlertBeforeUnload(){},enableAlertBeforeUnload(){},showToast(){}},console,setTimeout,clearTimeout})
 const page={...definition,data:structuredClone(definition.data),_visible:true,_seq:1,setData(patch){for(const[k,v]of Object.entries(patch)){const keys=k.split('.');let obj=this.data;while(keys.length>1){const key=keys.shift();obj=obj[key]||(obj[key]={})}obj[keys[0]]=v}}}
 page.onLoad?.({mode:extra.mode||'books',month:'2026-10'});await page.load();Object.assign(page.data,extra)
 return page
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(entry).href);await helper.renderer(p)
  const list=await model('member-tools'),editor=await model('member-tools');await editor.newBook();editor.bookInput({currentTarget:{dataset:{field:'name'}},detail:{value:'每一笔旅行，都有自己的故事'}})
  const sort=await model('member-tools');await sort.startBookSort();sort.bookSortStep({currentTarget:{dataset:{index:0,step:1}}})
  const variants=[['books',list.data],['books-sort',sort.data],['books-free',(await model('member-tools','free')).data]]
  for(let i=0;i<4;i++){editor.coverChange({currentTarget:{dataset:{index:i}}});variants.push(['editor-'+editor.data.covers[i].id,structuredClone(editor.data)])}
  const long=structuredClone(sort.data);long.activeBooks[0].name='这是一本名称很长的账本，用来检查放大文字后的拖动和换行';variants.push(['books-sort-long',long])
  for(const[label,data]of variants)for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   const audit=await helper.render(p,'member-tools',data,width,large);assert.equal(audit.bodyWidth,width,label+' overflow');assert.deepEqual(audit.broken,[]);assert.deepEqual(audit.overflow,[])
   const layout=await p.evaluate(()=>({outside:[...document.querySelectorAll('.book-display,.book-cover-options,.book-cover-option,.book-list-heading')].filter(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||n.scrollWidth>n.clientWidth+2}).map(n=>n.className),targets:[...document.querySelectorAll('.book-sort-entry,.book-drag-handle,.book-step-controls button,.book-cover-option')].map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height}}),old:!!document.querySelector('.book-inline-sticker'),fields:[...document.querySelectorAll('.book-field-label')].map(n=>n.textContent)}))
   assert.deepEqual(layout.outside,[],label+' '+JSON.stringify(layout));assert.ok(layout.targets.every(r=>r.w>=44&&r.h>=44));assert.equal(layout.old,false);assert.ok(!layout.fields.some(x=>/贴纸|排序/.test(x)))
   if(label.startsWith('editor')){assert.equal(await p.locator('.book-cover-option').count(),4);assert.equal(await p.locator('.book-preview-label').textContent(),'预览');await p.locator('.book-sheet-scroll').evaluate(n=>{n.style.overflowY='auto';n.scrollTop=n.scrollHeight})}
   if(label==='books-sort')assert.equal(await p.locator('.book-drag-handle').count(),4)
   await p.screenshot({path:path.join(out,label+'-'+width+(large?'-large':'')+'.png'),fullPage:true});checks.push({label,width,large,passed:true})
  }
  const sharp=require(process.env.PALM_SHARP_PATH || 'sharp'),assets=[]
  for(const id of ['daily','travel','home','hobby']){const file=path.join(root,'pages/member-tools/assets/book-covers',id+'.png'),meta=await sharp(file).metadata();assert.equal(meta.width,192);assert.equal(meta.height,252);assert.ok(meta.hasAlpha);assert.ok(fs.statSync(file).size<=12*1024);assets.push({id,bytes:fs.statSync(file).size,width:meta.width,height:meta.height})}
  for(const dpr of [2,3]){const dense=await browser.newPage({deviceScaleFactor:dpr,viewport:{width:390,height:150}});await dense.goto(pathToFileURL(entry).href);await dense.setContent('<style>body{margin:20px;display:flex;gap:20px;background:#fffef5}img{width:64px;height:84px}</style>'+assets.map(a=>'<img src="'+pathToFileURL(path.join(root,'pages/member-tools/assets/book-covers',a.id+'.png')).href+'">').join(''));await dense.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await dense.screenshot({path:path.join(out,'covers-'+dpr+'x.png')});await dense.close();checks.push({label:'covers-'+dpr+'x',passed:true,sourcePixelsPerDisplayedPixel:3})}
  await sharp({create:{width:4*222,height:292,channels:4,background:'#FFFDF5'}}).composite(assets.map((a,i)=>({input:path.join(root,'pages/member-tools/assets/book-covers',a.id+'.png'),left:15+i*222,top:20}))).png().toFile(path.join(out,'comic-covers.png'))
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,assets,assetBytes:assets.reduce((n,a)=>n+a.bytes,0),isolated:true,realDevice:false,cloudWrites:0},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,assetBytes:assets.reduce((n,a)=>n+a.bytes,0)}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
