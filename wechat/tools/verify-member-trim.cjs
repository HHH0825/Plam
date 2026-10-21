// Actual WXML/WXSS and page controllers, backed by isolated fixture responses.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/member-trim-20261017')
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/member-trim-fixture.json'),'utf8')).responses
async function model(name,kind='active',extra={}){
 let definition;const file=path.join(root,'pages',name,'index.js'),local=createRequire(file),app={globalData:{token:'isolated-refine'},requireSession:()=>true}
 const status={...structuredClone(fixture['/membership']),supported:true,active:kind==='active',status:kind==='active'?'active':kind==='expired'?'expired':'free',payment_open:false,purchase_allowed:false,expires_at:kind==='active'?1798761600:kind==='expired'?1791907200:null,server_time:1792123200}
 const api={request:async url=>{let result=fixture[url]||fixture[url.split('?')[0]];if(url.startsWith('/member/budget'))result=extra.budgetResponse||fixture['/member/budget?month=2026-10&book_id=all'];if(!result)throw Error('No fixture: '+url);return structuredClone(result)}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/member')?{...require('../miniprogram/utils/member'),wrap:d=>d,load:async()=>status,ensure:async()=>kind==='active'}:n.endsWith('/api')?api:n.endsWith('/navigation')?{resetNavigation(){},navigate(){}}:local(n),Page:d=>definition=d,getApp:()=>app,wx:{setNavigationBarTitle(){},disableAlertBeforeUnload(){},enableAlertBeforeUnload(){},showToast(){}},console,setTimeout,clearTimeout})
 const page={...definition,data:structuredClone(definition.data),_visible:true,_seq:1,setData(patch){for(const[k,v]of Object.entries(patch)){const keys=k.split('.');let obj=this.data;while(keys.length>1){const key=keys.shift();obj=obj[key]||(obj[key]={})}obj[keys[0]]=v}}}
 page.onLoad?.({mode:extra.mode||'books',month:'2026-10'});await page.load();Object.assign(page.data,extra)
 return page
}
function css(file){return fs.readFileSync(path.join(root,file),'utf8').replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))))}
function expanded(file){return fs.readFileSync(path.join(root,file),'utf8').replace(/<import\b[^>]*\/>/g,'').replace(/<include src="([^"]+)"\s*\/>/g,(_,p)=>expanded(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))))}
async function render(page,name,data,width,large){
 const template=expanded('pages/'+name+'/index.wxml').replace(/<(view|block|image|input|canvas|checkbox|progress|paper-background|template|cash-donut)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(scroll-view|checkbox-group|view|picker|block|text|image)(?=[\s>])/g,(_,pre,tag)=>pre+({'scroll-view':'wx-scroll','checkbox-group':'div',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[tag]))
 const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img').replace(/\bscroll-view\b/g,'wx-scroll')+'\nwx-scroll{display:block;overflow-x:auto;max-width:100%}'
 await page.setViewportSize({width,height:844});await page.evaluate(args=>window.render(...args),[template,styles,data,pathToFileURL(root).href])
 if(large)await page.evaluate(()=>{const nodes=[...document.querySelectorAll('.page div,.page span,.page button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);nodes.forEach(([n,size])=>n.style.fontSize=size*1.3+'px')})
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))))
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(entry).href);await helper.renderer(p)
  const books=await model('member-tools'),budget=await model('member-tools','active',{mode:'budgets'}),membership=await model('membership'),compare=await model('member-benefits'),me=await helper.state('me','active');me.memberToolsExpanded=true
  const base=await model('member-tools');const journal=require('./ledger-journal-fixtures.cjs'),dash=require('../miniprogram/utils/item-dashboard'),itemFixture=require('../tests/fixtures/item-dashboard.cjs'),ledger=require('../miniprogram/utils/ledger')
  const toolbar={memberSupported:true,memberBooks:[{id:'all',name:'全部账本'},{id:'default',name:'日常账本'}],memberBookIndex:0,memberBookId:'all',memberError:''}
  const stats={...ledger.tabPage(true).data,...journal.patch('statistics'),...toolbar,view:'cash'},items={...stats,...dash.empty(),view:'items',itemStats:dash.presentStats(itemFixture.stats),itemReminders:dash.reminders(itemFixture.insights),memberError:'会员工具暂不可用'}
  const detail={loading:false,busy:false,error:'',memberSupported:true,row:ledger.row({...journal.entries[1],refunds:[],changes:[]})}
  const long=structuredClone(books.data);long.bookTab='entries';long.scopeOptions[0].name='这是一个名称特别长的账本筛选名称'
  const variants=[['books','member-tools',books.data],['entries','member-tools',{...books.data,bookTab:'entries'}],['entries-long','member-tools',long],['budget','member-tools',budget.data],['membership','membership',membership.data],['comparison','member-benefits',compare.data],['me','me',me],['statistics-cash','statistics',stats],['statistics-items','statistics',items],['statistics-error','statistics',{...stats,memberError:'会员工具暂不可用，基础功能可继续使用。'}],['ledger','ledger',{...ledger.tabPage(false).data,...journal.patch('ledger'),...toolbar,totalBudgetText:'设置本月预算'}],['detail','ledger-detail',detail]]
  for(const[label,name,data]of variants)for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   await render(p,name,data,width,large)
   const audit=await p.evaluate(()=>({bodyWidth:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),tabs:[...document.querySelectorAll('.tools-segments>button')].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),oldText:document.body.textContent.includes('自定义分析')||document.body.textContent.includes('设置标签')}))
   assert.equal(audit.bodyWidth,width,label+' overflow');assert.deepEqual(audit.broken,[],label+' art');assert.equal(audit.oldText,false)
   if(name==='member-tools'){assert.equal(audit.tabs.length,label.startsWith('budget')?0:2);if(audit.tabs.length){assert.ok(audit.tabs.every(t=>t.height>=44));assert.ok(Math.abs(audit.tabs[0].width-audit.tabs[1].width)<1)}}
   if(name==='statistics'){
    const pane=await p.evaluate(()=>{const main=document.querySelector('.statistics-view-switch').getBoundingClientRect(),bar=document.querySelector('.statistics-book-toolbar')?.getBoundingClientRect();return {mainBottom:main.bottom,barTop:bar?.top,children:document.querySelector('.statistics-book-toolbar')?.children.length||0,error:!!document.querySelector('.member-tool-error')}})
    if(data.view==='items'){assert.equal(pane.children,0);assert.equal(pane.error,false)}else{assert.equal(pane.children,2);assert.ok(pane.barTop>=pane.mainBottom);assert.equal(await p.locator('.ledger-calendar').count(),1)}
   }
   if(name==='ledger')assert.equal(await p.locator('.member-ledger-toolbar').evaluate(n=>n.children.length),3)
   if(name==='ledger-detail'){const style=await p.locator('.ledger-detail-source').evaluate(n=>({bg:getComputedStyle(n).backgroundColor,border:getComputedStyle(n).borderWidth,shadow:getComputedStyle(n).boxShadow}));assert.equal(style.bg,'rgba(0, 0, 0, 0)');assert.equal(style.border,'0px');assert.equal(style.shadow,'none')}
   if(name==='me')assert.equal(await p.locator('.member-tool-menu').count(),3)
   if(label.startsWith('entries')){assert.equal(await p.locator('.book-filter-caret').count(),1);assert.ok(await p.locator('.book-filter').evaluate(n=>n.getBoundingClientRect().height>=44))}
   await p.screenshot({path:path.join(out,label+'-'+width+(large?'-large':'')+'.png'),fullPage:true});checks.push({label,width,large,passed:true})
  }
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,isolated:true,cloudWrites:0,realDevice:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
