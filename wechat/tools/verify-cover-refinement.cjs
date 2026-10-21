// Render actual production templates at multiple widths without account data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/cover-refinement-20261011'),scratch=path.resolve(__dirname,'../.qa-cover-refinement'),covers=require('../miniprogram/utils/item-covers'),view=require('../miniprogram/utils/view')
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),base=pathToFileURL(root).href
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
function markup(f){return read(f).replace(/<include src="([^"]+)"\s*\/>/g,(_,s)=>markup(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
function data(name){let definition;const file=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:d=>definition=d,wx:{},getApp:()=>({globalData:{}})});return JSON.parse(JSON.stringify(definition.data))}
const item=view.decorate({id:1,name:'一起去旅行的相机',category:'摄影收藏',icon_type:'digital',cover_mode:'icon',cover_icon_key:'camera',status:'active',holding_days:365,daily_net_cost:'1.28',purchase_price:'467.20',purchase_date:'2025-10-11',maintenance_records:[],usage_records:[],notes:'记录生活的小片段',fixed_expense_total:'0.00',maintenance_total:'0.00',disposal_proceeds:'0.00',net_cost:'467.20'})

const {choose}=require('../miniprogram/utils/metric-layout')
const fixtures=[['1999.00',1],['999999999.99',126],['-12.34',99999999],['0.00',119],[null,4],['999999999999999999999999999999.99',999999999999]]
async function main(){fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body></body>');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
 const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8');const start=helper.indexOf(' await page.evaluate(()=>{window.render=');const end=helper.indexOf('\n await require(',start);await new Function('page','return (async()=>{'+helper.slice(start,end)+'})()')(page)
 await page.evaluate('window.choose='+choose.toString())
 for(const width of [320,390,430,768])for(const kind of ['list','list-large','archive','detail','detail-large','detail-extreme','picker','picker-large','picker-empty','picker-keyboard','login','me']){
  const detail=kind.startsWith('detail'),picker=kind.startsWith('picker'),name=detail?'item':kind.startsWith('list')?'items':kind==='archive'?'disposed':picker?'editor':kind,d={...data(name),loading:false,error:'',busy:false};
  if(picker)Object.assign(d,{coverSupported:true,coverCapabilityLoading:false,coverCapabilityError:'',iconOpen:true,iconSelected:'camera',iconRows:kind==='picker-empty'?[]:covers.catalogue,iconQuery:kind==='picker-empty'?'暂未收录的物品':'',coverSheetHeight:kind==='picker-keyboard'?392:0})
  if(['items','disposed'].includes(name)){const rows=fixtures.map(([daily,days],i)=>view.decorate({...item,id:i+1,name:i?'日常收藏 '+(i+1):'相机',daily_net_cost:daily,holding_days:days,status:name==='disposed'?'disposed':'active'}));Object.assign(d,{items:rows,shown:rows,metricLayouts:Object.fromEntries(rows.map(i=>[i.id,{kind:'stacked',size:24,height:39}]))})}
  if(detail)Object.assign(d,{costLayout:{kind:'stacked',size:28,height:44,totalHeight:32},item:view.decorate({...item,daily_net_cost:kind==='detail-extreme'?fixtures[5][0]:fixtures[1][0],net_cost:kind==='detail-extreme'?fixtures[5][0]:'999999999.99',holding_days:99999999}),factsExpanded:true})
  if(name==='me')Object.assign(d,{user:{nickname:'本地示例用户',avatar_key:'cat'},overview:{held_count:3,purchase_total:'1999.00',account_age_days:12},overviewState:'ready'})
  const template=markup('pages/'+name+'/index.wxml').replace(/<(view|block|image|input|textarea)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|picker|scroll-view)(?=[\s>])/g,'div').replace(/\bblock(?=[\s>])/g,'wx-block').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
  const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')
  await page.setViewportSize({width,height:kind==='picker-keyboard'?400:844})
  const render=async()=>{await page.evaluate(args=>window.render(...args),[template,styles,d,base]);if(kind.endsWith('large'))await page.evaluate(()=>{const rows=[...document.querySelectorAll('span,button,input,.small,.metric-probe')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,size]of rows)n.style.fontSize=size*1.3+'px'})}
  await render()
  if(detail||['items','disposed'].includes(name)){
   const layouts=await page.evaluate(detail=>{const rect=n=>({...n.getBoundingClientRect().toJSON(),dataset:{...n.dataset}}),regions=[...document.querySelectorAll('.metric-region')].map(rect),available=[...document.querySelectorAll('.metric-available')].map(rect),texts=[...document.querySelectorAll('.metric-probe')].map(rect);return Object.fromEntries(regions.map(r=>{const w=available.find(n=>n.dataset.id===r.dataset.id),probes=Object.fromEntries(texts.filter(n=>n.dataset.id===r.dataset.id).map(n=>[n.dataset.size,n]));return[r.dataset.id,window.choose(w.width,r.width,probes,detail)]}))},detail)
   if(detail)d.costLayout=layouts.detail;else d.metricLayouts=layouts
   await render()
  }
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
  const check=await page.evaluate(()=>{const sheet=document.querySelector('.cover-sheet'),close=document.querySelector('.cover-close'),footer=document.querySelector('.cover-sheet-footer'),rect=n=>n?.getBoundingClientRect(),sr=rect(sheet),cr=rect(close);return{overflow:document.documentElement.scrollWidth>innerWidth,failed:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),close:!sheet||Math.abs(sr.right-cr.right-12)<1&&Math.abs(cr.top-sr.top-12)<1&&Math.abs(cr.width-44)<1&&Math.abs(cr.height-44)<1,feedback:!sheet||!!document.querySelector('.cover-feedback[open-type="feedback"]'),footer:!footer||rect(footer).bottom<=innerHeight+1,nowrap:[...document.querySelectorAll('.daily-number,.cost-summary .metric-value,.cost-total-amount')].every(n=>getComputedStyle(n).whiteSpace==='nowrap'),scrollers:[...document.querySelectorAll('.metric-scroll')].map(n=>({width:n.clientWidth,content:n.scrollWidth,height:n.clientHeight,child:n.firstElementChild.getBoundingClientRect().height})),dots:getComputedStyle(document.body).backgroundImage.startsWith('url(')}})
  checks.push({width,kind,...check});if(check.overflow||check.failed.length||!check.close||!check.feedback||!check.footer||!check.nowrap||!check.dots||check.scrollers.some(n=>n.child>n.height+1))throw Error(JSON.stringify(checks.at(-1)))
  await page.screenshot({path:path.join(out,kind+'-'+width+'.png'),fullPage:!picker})
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,cases:checks.length,checks,native:false},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
