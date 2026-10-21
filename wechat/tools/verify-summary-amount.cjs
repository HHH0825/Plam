// Local synthetic fixtures, actual page markup/styles and production layout decisions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const {presentMonthly}=require('../miniprogram/utils/monthly'),{compactMoney}=require('../miniprogram/utils/compact-money'),{readOverview}=require('../miniprogram/utils/me-overview'),layout=require('../miniprogram/utils/summary-layout'),{avatarState}=require('../miniprogram/utils/profile')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/summary-amount-20261012'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),base=pathToFileURL(root).href
function initial(name){let d;const f=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(f,'utf8'),{require:createRequire(f),Page:x=>d=x,wx:{},getApp:()=>({globalData:{}})});return JSON.parse(JSON.stringify(d.data))}
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
const cases={insights:[['normal','13547.00'],['recovery','-500.00'],['balanced','0.00'],['large','999999999.99'],['extreme','999999999999999999999999.99'],['empty',null]],me:[['normal','17551.90'],['full','9999.99'],['zero','0.00'],['round-up','99999950.00'],['extreme','999999999999999999999999999999999999.99'],['modal','17551.90'],['modal-extreme','999999999999999999999999999999999999.99'],['loading',null],['legacy',null],['error',null]]}
async function main(){
 fs.mkdirSync(out,{recursive:true});const file=path.join(out,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
 const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start);await new Function('page','return(async()=>{'+helper.slice(start,end)+'})()')(page)
 await page.evaluate('window.chooseMonthly='+layout.chooseMonthly.toString()+';window.chooseOverview='+layout.chooseOverview.toString())
 await require('./white-nav-preview.cjs')(page,root)
 for(const name of ['insights','me'])for(const [key,value]of cases[name])for(const width of [320,390,430,768])for(const large of [false,true]){
  const d={...initial(name),loading:false,error:'',statsLoading:false,monthlyLoading:false,cardsLoading:false},scale=large?1.3:1
  if(name==='insights'){
   const report={month:'2026-10',today:'2026-10-12',cutoff_date:'2026-10-12',is_current:true,has_activity:value!==null,totals:{purchase_count:3,purchase_total:'14047.00',maintenance_total:'0.00',disposal_total:'500.00',cashflow_net:value||'0.00'},purchases:[],purchase_leaders:[],memories:[]};d.monthly={...report,page:presentMonthly(report)}
  }else{
   const amount=compactMoney(value),user={id:99001,username:'微信用户1',avatar_key:'cat'}
   Object.assign(d,{user,...avatarState(user),...readOverview(value===null?{}:{held_items:6,held_purchase_total:value}),heldAmountDisplay:amount.display,heldAmountCompact:amount.compact,accountDays:'7',ageCompatible:true,statsLoading:key==='loading',amountDialog:key.startsWith('modal'),statsError:key==='error'?'统计读取失败，请重试':''})
  }
  const template=read('pages/'+name+'/index.wxml').replace(/<(view|block|image)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|picker|scroll-view)(?=[\s>])/g,'div').replace(/\bblock(?=[\s>])/g,'wx-block').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
  const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')
  await page.setViewportSize({width,height:width===320?640:844});await page.evaluate(args=>window.render(...args),[template,styles,d,base])
  if(large)await page.evaluate(scale=>{const nodes=[...document.querySelectorAll('.page span,.page button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,s]of nodes)n.style.fontSize=s*scale+'px'},scale)
  const chosen=await page.evaluate(({name,scale})=>{
   const region=document.querySelector('.summary-region'),count=document.querySelector('.summary-count'),probes=Object.fromEntries([...document.querySelectorAll('.summary-probe')].map(n=>[n.dataset.size,{width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}]))
   if(!Object.keys(probes).length)return null
   const choice=name==='me'?chooseOverview(region.getBoundingClientRect().width,probes):chooseMonthly(region.getBoundingClientRect().width,count.getBoundingClientRect().width,probes)
   region.classList.remove(name==='me'?'overview-columns':'brief-columns');region.classList.add((name==='me'?'overview-':'brief-')+choice.kind)
   const scroll=document.querySelector(name==='me'?'.overview-money-scroll':'.brief-amount-scroll'),text=scroll.querySelector('span');scroll.style.fontSize=choice.size*scale+'px';scroll.style.height=choice.height+'px';text.style.fontSize='inherit'
   scroll.style.overflowX=choice.scroll?'auto':'hidden';return choice
  },{name,scale})
  if(name==='me'&&!d.amountDialog)await page.evaluate(base=>window.mountWhiteNav(1,base),base)
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
  const check=await page.evaluate(({name,chosen})=>{
   const scroll=document.querySelector(name==='me'?'.overview-money-scroll':'.brief-amount-scroll'),text=scroll?.querySelector('span'),rect=n=>n.getBoundingClientRect(),button=document.querySelector('.amount-cell'),divider=document.querySelector('.profile-divider'),logout=document.querySelector('.logout-button'),dialogText=document.querySelector('.amount-dialog-value'),dialogScroll=document.querySelector('.amount-dialog-scroll')
   return{overflow:document.documentElement.scrollWidth>innerWidth,failed:[...document.images].filter(i=>!i.naturalWidth).length,nowrap:!text||getComputedStyle(text).whiteSpace==='nowrap',fits:!text||!!chosen?.scroll||rect(text).width<=rect(scroll).width+1,heightFits:!text||rect(text).height<=rect(scroll).height+1,oneLine:!text||rect(text).height<parseFloat(getComputedStyle(text).fontSize)*1.7,click:!button||rect(button).height>=44,divider:!divider||getComputedStyle(divider).pointerEvents==='none',logout:!logout||getComputedStyle(logout).backgroundColor==='rgb(255, 240, 243)',dialog:!dialogText||getComputedStyle(dialogText).whiteSpace==='nowrap'&&rect(dialogText).height<=rect(dialogScroll).height,value:text?.textContent,layout:chosen}
  },{name,chosen})
  checks.push({name,key,width,large,...check});if(check.overflow||check.failed||!check.nowrap||!check.fits||!check.oneLine||!check.heightFits||!check.click||!check.divider||!check.logout||!check.dialog)throw Error(JSON.stringify(checks.at(-1)))
  if(width===390&&!large||width===320&&large&&['normal','extreme'].includes(key)||width===768&&key==='normal'&&!large)await page.screenshot({path:path.join(out,`${name}-${key}-${width}${large?'-large':''}.png`),fullPage:!d.amountDialog})
  if(name==='me'&&!d.amountDialog){
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));const covered=await page.evaluate(()=>document.querySelector('.logout-button').getBoundingClientRect().bottom>document.querySelector('.tab-bar').getBoundingClientRect().top)
   if(covered)throw Error('Logout hidden by navigation '+JSON.stringify(checks.at(-1)))
   if(width===390&&!large&&key==='normal')await page.screenshot({path:path.join(out,'me-footer-390.png')})
  }
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,cases:checks.length,fixtureOnly:true,checks},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
