// Actual WXML/WXSS, isolated in-memory examples; no account or cloud writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),output=path.resolve(__dirname,'../docs/images/storage-locations/layout'),scratch=path.resolve(__dirname,'../.qa-locations')
const read=file=>fs.readFileSync(path.join(root,file),'utf8'),base=pathToFileURL(root).href,app={},wx={cloud:{callHTTPFunction(){}}}
vm.runInNewContext('('+fs.readFileSync(path.join(__dirname,'purchases-native-check.js'),'utf8')+')',{wx,getApp:()=>app})('setup')
const item=app._purchasesQA.item,view=require('../miniprogram/utils/view')
const locations=[{id:1,name:'书桌抽屉',count:2,revision:0},{id:2,name:'衣柜上层',count:0,revision:0},{id:3,name:'门口的小收纳盒',count:1,revision:0}]
const items=[{...item,storage_location_id:1,storage_location_name:'书桌抽屉'}, {...item,id:990002,name:'每天陪我的水杯',icon_type:'daily',category:'日用品',storage_location_id:null,storage_location_name:null}, {...item,id:990003,name:'周末读的书',icon_type:'books',category:'阅读',status:'idle',storage_location_id:1,storage_location_name:'书桌抽屉'}].map(view.decorate)
const fixtures={items:{items,shown:items,query:'',status:'',category:'',sortIndex:0,sortLabels:['最近添加'],sortOptions:['最近添加'],categories:['全部分类'],photoPaths:{},photoStates:{},artErrors:{},entryIconErrors:{},entriesStacked:false,decorError:false,loading:false,error:'',filterCount:0,filterOpen:false},'storage-locations':{locations,shownLocations:locations,items,shownItems:items.filter(i=>i.storage_location_id===1),mode:'locations',locationId:1,locationName:'书桌抽屉',unassigned:1,query:'',itemQuery:'',picking:false,selecting:false,chosenCount:0,naming:false,loading:false,ready:true,busy:false,error:'',conflict:false,photoPaths:{},photoErrors:{},targetOpen:false}}
function stylesheet(file,seen=new Set()) {if(seen.has(file))return '';seen.add(file);return read(file).replace(/@import\s+["']([^"']+)["'];/g,(_,r)=>stylesheet(path.posix.normalize(path.posix.join(path.posix.dirname(file),r)),seen))}
async function main(){
 fs.mkdirSync(output,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'locations-preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body></body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const results=[]
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(pathToFileURL(file).href)
  const source=fs.readFileSync(path.join(__dirname,'verify-item-doodle.cjs'),'utf8'),begin=source.indexOf('    await page.evaluate(() => {'),end=source.indexOf("    await require('./white-nav-preview.cjs')",begin)
  await new (Object.getPrototypeOf(async function(){}).constructor)('page',source.slice(begin,end))(page);await require('./white-nav-preview.cjs')(page,root)
  async function capture(name,kind,width,patch={}) {
   await page.setViewportSize({width,height:844})
   const template=read('pages/'+kind+'/index.wxml').replace(/<(view|block|input|textarea)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|block|picker|scroll-view)(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
   const css=(stylesheet('app.wxss')+stylesheet('pages/'+kind+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w-])image\b/g,'img').replace(/url\(['"]?\/assets\//g,"url('"+base+'/assets/')
   await page.evaluate(({template,css,data,base,tabs})=>render(template,css,data,base,tabs),{template,css,data:{assignItemId:null,nameDraft:'',renameId:null,targetQuery:'',...fixtures[kind],...patch},base,tabs:JSON.parse(read('app.json')).tabBar})
   await page.evaluate(({kind,large})=>{document.querySelectorAll('[disabled="false"]').forEach(n=>n.removeAttribute('disabled'));if(kind!=='items')document.querySelector('.tab-bar')?.remove();if(large)Array.from(document.querySelectorAll('.page *')).map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]).forEach(([n,s])=>n.style.fontSize=s*1.3+'px')},{kind,large:patch.largeFont})
   await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
   const metrics=await page.evaluate(()=>{const rect=s=>{const n=document.querySelector(s);if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {overflow:document.documentElement.scrollWidth>innerWidth,entries:['.wishlist-entry','.subscription-entry','.storage-entry','.filter-control','.sort-picker'].map(rect),icons:Array.from(document.querySelectorAll('.purchase-entry-icon')).map(i=>({loaded:i.complete&&i.naturalWidth>0,width:i.getBoundingClientRect().width})),batch:rect('.storage-batch'),targets:rect('.storage-target')}})
   if(metrics.overflow)throw Error('Horizontal overflow: '+name+' '+width)
   if(kind==='items') {const [a,b,c,f,s]=metrics.entries;if(!(a.x<b.x&&f.x<s.x&&f.y>=c.y+c.height))throw Error('Toolbar ordering: '+name);if(width>=390&&!patch.largeFont&&!(a.y===b.y&&a.y===c.y&&b.x<c.x))throw Error('Three entries must fit: '+width);if(metrics.icons.some(i=>!i.loaded||i.width!==22)||[a,b,c,f].some(r=>r.height<44))throw Error('Icon/touch target: '+name)}
   if(metrics.batch&&metrics.batch.y+metrics.batch.height>844.5)throw Error('Batch action outside viewport')
   await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});results.push({name,width,...metrics})
  }
  for(const width of [320,390,430,768]){await capture('entries','items',width);await capture('locations','storage-locations',width);await capture('location-items','storage-locations',width,{mode:'items'})}
  await capture('batch-add','storage-locations',390,{mode:'items',selecting:true,picking:true,chosenCount:1,shownItems:items.map((i,n)=>({...i,checked:n===1,alreadyHere:n!==1}))})
  await capture('batch-move','storage-locations',390,{mode:'items',selecting:true,chosenCount:2,shownItems:items.map(i=>({...i,checked:true})),targetOpen:true,targets:[{id:null,name:'未设置位置'},...locations]})
  await capture('empty','storage-locations',390,{locations:[],shownLocations:[],unassigned:0})
  await capture('unavailable','storage-locations',390,{ready:false,error:'收纳位置功能暂不可用，请同步云端版本后重新检查。'})
  await capture('conflict','storage-locations',390,{mode:'items',selecting:true,chosenCount:2,conflict:true,error:'物品已更新，选择已保留，请刷新核对后重试。'})
  await capture('long-large-font','storage-locations',320,{largeFont:true,shownLocations:[{id:1,name:'衣柜顶部用来放换季物品与旅行配件的可爱大箱子'.repeat(2),count:50}]})
  await capture('entries-large-font','items',390,{largeFont:true,filterCount:2})
  await capture('new-location','storage-locations',320,{naming:true,nameDraft:'书桌抽屉'})
  fs.writeFileSync(path.join(output,'layout-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({screenshots:results.length,overflow:false}))
 } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
