// Offline layout checks use the real templates, styles and in-memory fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),output=path.resolve(process.env.PALM_PURCHASES_QA_OUTPUT || path.join(__dirname,'../docs/images/purchases')),scratch=path.resolve(__dirname,'../.qa-purchases')
const read=file=>fs.readFileSync(path.join(root,file),'utf8'),base=pathToFileURL(root).href
const app={},wx={cloud:{callHTTPFunction(){}}}
vm.runInNewContext('('+fs.readFileSync(path.join(__dirname,'purchases-native-check.js'),'utf8')+')', {wx,getApp:()=>app})('setup')
const {item,wish,expense}=app._purchasesQA
const fixture={
  items:{items:[item],shown:[require('../miniprogram/utils/view').decorate(item)],query:'',status:'',category:'',sortIndex:0,sortLabels:['最近添加'],sortOptions:['最近添加'],categories:['全部分类'],layout:'list',photoPaths:{},photoStates:{},artErrors:{},decorError:false,loading:false,error:'',filterCount:0,filterOpen:false},
  wishlist:{rows:[wish],shown:[{...wish,stateText:'考虑中',reviewText:'还有 5 天考虑'}],selected:null,editing:false,similar:[],photoPaths:{},busy:false,loading:false,error:'',conflict:false,filters:['考虑中','暂不买','已购入','全部'],filterIndex:0},
  'fixed-expenses':{rows:[expense],shown:[{...expense,kindText:'会员／服务',stateText:'管理中',dueText:'距付款还有 22 天',serviceText:'服务剩余 4 天',urgent:true}],items:[item],itemNames:['不关联物品',item.name],itemIndex:1,selected:null,editing:false,paying:false,filterIndex:0,filters:['管理中','已暂停','已结束','全部'],totals:{cents:'30.00',linked_cents:'30.00',unlinked_cents:'0.00',principal_cents:'0.00'},busy:false,loading:false,error:'',conflict:false}
}
function stylesheet(file,seen=new Set()){
  if(seen.has(file))return '';seen.add(file)
  return read(file).replace(/@import\s+["']([^"']+)["'];/g,(_,relative)=>stylesheet(path.posix.normalize(path.posix.join(path.posix.dirname(file),relative)),seen))
}
async function main(){
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'purchases-preview.html');fs.writeFileSync(file,'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const results=[]
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(pathToFileURL(file).href)
    // Shared renderer already used for the hand-drawn collection verification.
    const previous=fs.readFileSync(path.join(__dirname,'verify-item-doodle.cjs'),'utf8')
    const begin=previous.indexOf('    await page.evaluate(() => {'),end=previous.indexOf("    await require('./white-nav-preview.cjs')",begin)
    await new (Object.getPrototypeOf(async function(){}).constructor)('page',previous.slice(begin,end))(page)
    await require('./white-nav-preview.cjs')(page,root)
    async function capture(name,kind,width,patch={}){
      await page.setViewportSize({width,height:844})
      let template=read('pages/'+kind+'/index.wxml').replace(/<(view|block|input|textarea)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|block|picker|scroll-view)(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
      let css=stylesheet('app.wxss')+stylesheet('pages/'+kind+'/index.wxss')
      css=css.replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w-])image\b/g,'img').replace(/url\(['"]?\/assets\//g,"url('"+base+'/assets/')
      const data={itemFilter:0,entryIconErrors:{},listReady:true,itemsReady:true,itemsLoading:false,itemsError:'',featureUnavailable:false,detailMissing:false,...fixture[kind],...patch}
      await page.evaluate(({template,css,data,base,tabs})=>render(template,css,data,base,tabs),{template,css,data,base,tabs:JSON.parse(read('app.json')).tabBar})
      await page.evaluate(()=>document.querySelectorAll('[disabled="false"]').forEach(node=>node.removeAttribute('disabled')))
      if(kind!=='items')await page.evaluate(()=>document.querySelector('.tab-bar')?.remove())
      if(patch.largeFont)await page.evaluate(()=>Array.from(document.querySelectorAll('.page *')).map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]).forEach(([n,size])=>n.style.fontSize=size*1.3+'px'))
      await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
      const metrics=await page.evaluate(()=>{
        const rect=selector=>{const node=document.querySelector(selector);if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}
        return {overflow:document.documentElement.scrollWidth>innerWidth,buttons:Array.from(document.querySelectorAll('button')).filter(n=>n.getBoundingClientRect().width).map(n=>({text:n.textContent.trim(),height:n.getBoundingClientRect().height,disabled:n.disabled})),cards:Array.from(document.querySelectorAll('.card')).map(n=>Math.round(n.getBoundingClientRect().height)),entries:['.wishlist-entry','.subscription-entry','.storage-entry','.filter-control','.sort-picker'].map(rect),toolbar:rect('.subscription-toolbar'),summary:rect('.expense-totals'),icons:Array.from(document.querySelectorAll('.purchase-entry-icon')).map(n=>({loaded:n.complete&&n.naturalWidth>0,width:n.getBoundingClientRect().width}))}
      })
      if(metrics.overflow)throw Error('Horizontal overflow: '+name+' '+width)
      if(name==='unavailable' && (metrics.buttons.find(b=>b.text==='重新检查')?.disabled!==false || metrics.buttons.find(b=>b.text==='新增订阅/分期')?.disabled!==true))throw Error('Unavailable page must allow recheck and block add')
      if(kind==='items'){
        const [wish,subscription,storage,filter,sort]=metrics.entries
        if(!(wish.x<subscription.x && filter.x<sort.x))throw Error('Toolbar order: '+name)
        if(width===320 && !(filter.y>wish.y && filter.y===sort.y))throw Error('Narrow toolbar must have two rows')
        if(width>=390 && !patch.largeFont && !(wish.y===storage.y && subscription.x<storage.x && filter.y>storage.y))throw Error('Three entries followed by controls at '+width)
        if(metrics.icons.some(i=>!i.loaded||i.width!==22))throw Error('Entry icon failed')
        if(metrics.buttons.filter(b=>['想买清单','订阅/分期'].includes(b.text)).some(b=>b.height<44))throw Error('Entry touch area')
      }
      if(metrics.toolbar && metrics.summary && metrics.toolbar.y>=metrics.summary.y)throw Error('Filter below summary')
      await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});results.push({name,width,...metrics})
    }
    for(const width of [320,390,430,768]){await capture('items','items',width);await capture('wishlist','wishlist',width);await capture('expenses','fixed-expenses',width)}
    await capture('wish-similar','wishlist',390,{editing:true,selected:wish,form:{...wish,review_on:''},similar:[{...fixture.items.shown[0],match_reason:'分类相同'}]})
    await capture('payment','fixed-expenses',390,{selected:{...fixture['fixed-expenses'].shown[0],payments:expense.payments},paying:true,payment:{paid_on:'2026-10-10',amount:'30.00',service_until:'2026-11-14'},paymentItemIndex:1,paymentLinkText:item.name,today:'2026-10-10'})
    await capture('long','wishlist',320,{shown:[{...wish,name:'想为旅行和工作选一台适合长期使用的轻便设备'.repeat(3),reason:'先想清楚真正需要的功能。'.repeat(12),expected_price:'999999999.99',reviewText:'未设置考虑日期',stateText:'考虑中'}],largeFont:true})
    await capture('empty','fixed-expenses',390,{shown:[],totals:null})
    await capture('unavailable','fixed-expenses',390,{shown:[],totals:null,listReady:false,featureUnavailable:true,error:'订阅/分期功能暂不可用，云端接口尚未开放或版本未同步。请稍后重新检查。'})
    await capture('network-error','fixed-expenses',320,{shown:[],totals:null,listReady:false,error:'网络暂不可用，请稍后重试。'})
    await capture('deleted-detail','fixed-expenses',390,{selected:expense,detailMissing:true,error:'这条订阅/分期记录已删除或无法访问，请返回列表。'})
    await capture('items-error','fixed-expenses',390,{itemsReady:false,itemsError:'关联物品读取失败，已有订阅/分期仍可查看；原关联保留，暂不能更换。'})
    await capture('items-error-edit','fixed-expenses',320,{selected:expense,editing:true,form:expense,itemsReady:false,itemNames:['不关联物品'],itemsError:'关联物品读取失败，已有订阅/分期仍可查看；原关联保留，暂不能更换。',formLinkText:'保留原关联：旅行相机（暂不能更换）',kinds:['会员／服务','设备分期'],statuses:['管理中','已暂停','已结束'],cycles:['每月','每季','每年','自定义天数'],kindIndex:0,cycleIndex:0,statusIndex:0})
    await capture('subscription-large-font','fixed-expenses',320,{shown:[{...fixture['fixed-expenses'].shown[0],name:'工作与旅行都在用的云空间服务'.repeat(2)}],largeFont:true})
    await capture('items-large-font','items',390,{largeFont:true})
    // Export uses production canvas commands, including fixed fees and separate principal.
    const report={month:'2026-10',today:'2026-10-10',cutoff_date:'2026-10-10',is_current:true,has_activity:true,totals:{purchase_count:0,purchase_total:'0.00',maintenance_total:'0.00',disposal_total:'0.00',fixed_expense_total:'12.00',installment_principal_total:'50.00',cashflow_net:'12.00'},purchases:[],purchase_leaders:[],memories:[]}
    const png=await page.evaluate(async({sources,report,base})=>{
      const modules={}
      const load=name=>{
        if(name==='./photo-edit')return {}
        if(modules[name])return modules[name]
        if(!sources[name])throw Error('Missing visual QA module: '+name)
        const module={exports:{}};modules[name]=module.exports
        new Function('module','require',sources[name])(module,load);modules[name]=module.exports;return module.exports
      }
      const renderer=load('./report-image'),canvas=document.createElement('canvas'),context=canvas.getContext('2d'),layout=renderer.planReport(context,report)
      canvas.width=layout.width;canvas.height=layout.height;const images=new Map()
      await Promise.all([...new Set(layout.commands.filter(c=>c.kind==='image').map(c=>c.src))].map(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images.set(src,img);resolve()};img.onerror=reject;img.src=base+src})))
      renderer.drawLayout(context,layout,images);return canvas.toDataURL('image/png').split(',')[1]
    },{sources:Object.fromEntries(['report-image','report-design','monthly','collection','view'].map(name=>['./'+name,read('utils/'+name+'.js')])),report,base})
    fs.writeFileSync(path.join(output,'monthly-fees-export.png'),Buffer.from(png,'base64'))
    fs.writeFileSync(path.join(output,'layout-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({screenshots:results.length,overflow:results.some(r=>r.overflow)}))
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
