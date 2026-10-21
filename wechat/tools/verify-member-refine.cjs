// Actual WXML/WXSS and page controllers, backed by isolated fixture responses.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/member-refine-20261016')
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
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
  const browserPage=await browser.newPage();await browserPage.goto(pathToFileURL(entry).href);await helper.renderer(browserPage)
  const books=await model('member-tools'),budget=await model('member-tools','active',{mode:'budgets',title:'月度预算'});await budget.loadBudget('isolated-refine',budget._seq)
  const variants=[['books',books,{}],['books-entries',books,{bookTab:'entries'}],['books-tags',books,{bookTab:'tags'}],['book-editor',books,{bookSheetOpen:true}],['budget',budget,{}],['budget-editor',budget,{budgetSheetOpen:true}],['comparison',await model('member-benefits'),{}],['membership',await model('membership'),{}],['membership-collapsed',await model('membership'),{startupExpanded:false}]]
  for(const [state,limit,used]of [['unset',null,42000],['near',50000,42000],['over',30000,42000],['refund_surplus',50000,-6000]]){
   const response={revision:0,total_cents:limit,category_cents:{},categories:[],total:{limit_cents:limit,used_cents:used,remaining_cents:limit===null?null:limit-used,over_cents:limit===null?0:Math.max(0,used-limit),percent:limit===null?0:Math.max(0,Math.min(100,Math.floor(used*100/limit))),status:state}}
   const p=await model('member-tools','active',{mode:'budgets',title:'月度预算',budgetResponse:response});await p.loadBudget('isolated-refine',p._seq);variants.push(['budget-'+state,p,{}])
  }
  for(const[label,page,patch]of variants)for(const[width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   const data={...structuredClone(page.data),...patch},name=label.startsWith('membership')?'membership':label==='comparison'?'member-benefits':'member-tools'
   const audit=await helper.render(browserPage,name,data,width,large);assert.equal(audit.bodyWidth,width,label+' overflow');assert.deepEqual(audit.broken,[],label+' broken art')
   const geometry=await browserPage.evaluate(()=>({outside:[...document.querySelectorAll('.tools-segments,.book-display,.budget-overview,.budget-category-list,.benefits-column,.member-comparison-entry,.member-ad-benefit')].filter(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||n.scrollWidth>n.clientWidth+2}).map(n=>n.className),tabs:[...document.querySelectorAll('.tools-segments>button')].map(n=>n.getBoundingClientRect().height),adTag:document.querySelector('.member-ad-benefit')?.tagName,oldInfo:[...document.querySelectorAll('button')].some(n=>n.textContent.includes('会员服务说明'))}))
   assert.deepEqual(geometry.outside,[],label+' '+JSON.stringify(geometry));assert.ok(geometry.tabs.every(h=>h>=44));const buttons=await browserPage.locator('.member-tools .button.block').evaluateAll(nodes=>nodes.filter(n=>!n.disabled).map(n=>({width:n.getBoundingClientRect().width,parent:n.parentElement.getBoundingClientRect().width})));assert.ok(buttons.every(b=>b.width>=b.parent-44),label+' narrow primary button '+JSON.stringify(buttons))
   if(name==='membership'){assert.equal(geometry.adTag,'DIV');assert.equal(geometry.oldInfo,false);assert.equal(await browserPage.locator('.member-startup-toggle').count(),1)}
   if(name==='member-benefits')assert.equal(await browserPage.locator('.benefits-column').count(),2)
   const screenshot=label+'-'+width+(large?'-large':'')+'.png';await browserPage.screenshot({path:path.join(out,screenshot),fullPage:true});checks.push({label,width,large,passed:true,...audit})
  }
  for(const kind of ['free','expired']){const page=await model('member-tools',kind,{mode:'budgets',title:'月度预算'});await page.loadBudget('isolated-refine',page._seq);await helper.render(browserPage,'member-tools',page.data,390,false);await browserPage.screenshot({path:path.join(out,'budget-'+kind+'.png'),fullPage:true});checks.push({label:'budget-'+kind,passed:true})}
  for(const expanded of [false,true]){const data=await helper.state('me','active');data.memberToolsExpanded=expanded;await helper.render(browserPage,'me',data,390,false);assert.equal(await browserPage.locator('.member-tool-menu').count(),expanded?4:0);await browserPage.screenshot({path:path.join(out,'me-tools-'+(expanded?'expanded':'collapsed')+'.png'),fullPage:true});checks.push({label:'me-tools-'+expanded,passed:true})}
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,isolated:true,remoteWrites:0,realDevice:false},null,2));console.log(JSON.stringify({passed:true,layoutChecks:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
