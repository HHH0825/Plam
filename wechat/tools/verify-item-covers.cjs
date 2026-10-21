// Render actual production templates at multiple widths without account data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/item-covers-20261011'),scratch=path.resolve(__dirname,'../.qa-item-covers'),covers=require('../miniprogram/utils/item-covers'),view=require('../miniprogram/utils/view')
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),base=pathToFileURL(root).href
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
function markup(f){return read(f).replace(/<include src="([^"]+)"\s*\/>/g,(_,s)=>markup(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
function data(name){let definition;const file=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:d=>definition=d,wx:{},getApp:()=>({globalData:{}})});return JSON.parse(JSON.stringify(definition.data))}
const item=view.decorate({id:1,name:'一起去旅行的相机',category:'摄影收藏',icon_type:'digital',cover_mode:'icon',cover_icon_key:'camera',status:'active',holding_days:365,daily_net_cost:'1.28',purchase_price:'467.20',purchase_date:'2025-10-11',maintenance_records:[],usage_records:[],notes:'记录生活的小片段',fixed_expense_total:'0.00',maintenance_total:'0.00',disposal_proceeds:'0.00',net_cost:'467.20'})
async function main(){fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body></body>');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
 const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8');const start=helper.indexOf(' await page.evaluate(()=>{window.render=');const end=helper.indexOf('\n await require(',start);await new Function('page','return (async()=>{'+helper.slice(start,end)+'})()')(page)
 for(const width of [320,390,430,768])for(const kind of ['editor','picker','detail','list','picker-large','editor-large','picker-short','unavailable']){
  const name=kind==='detail'?'item':kind==='list'?'items':'editor',d={...data(name),loading:false,error:'',busy:false};
  if(name==='editor')Object.assign(d,{coverSupported:kind!=='unavailable',coverCapabilityLoading:false,coverCapabilityError:kind==='unavailable'?'预设图标需要同步新版后端，当前仍可选择照片。':'',coverArt:item.art,form:{...d.form,name:item.name,category:item.category,icon_type:'digital',cover_mode:'icon',cover_icon_key:'camera',purchase_price:'467.20'},iconOpen:kind.startsWith('picker'),iconSelected:'camera',iconRows:covers.catalogue})
  if(name==='items')Object.assign(d,{items:[item,view.decorate({...item,id:2,name:'喜欢的水杯',cover_icon_key:'cup',icon_type:'daily'})],shown:[item,view.decorate({...item,id:2,name:'喜欢的水杯',cover_icon_key:'cup',icon_type:'daily'})]})
  if(name==='item')Object.assign(d,{item,factsExpanded:true})
  const template=markup('pages/'+name+'/index.wxml').replace(/<(view|block|image|input|textarea)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|picker|scroll-view)(?=[\s>])/g,'div').replace(/\bblock(?=[\s>])/g,'wx-block').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
  const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')
  await page.setViewportSize({width,height:kind.endsWith('short')?504:844});await page.evaluate(args=>render(...args),[template,styles,d,base])
  if(kind.endsWith('large'))await page.evaluate(()=>{const rows=[...document.querySelectorAll('span,button,input,.small')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,size]of rows)n.style.fontSize=size*1.3+'px'})
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
  const check=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,failed:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),choices:[...document.querySelectorAll('.cover-option,.cover-group,.cover-choices button,.cover-sheet-footer button')].map(n=>({height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})),footerVisible:!document.querySelector('.cover-sheet-footer')||document.querySelector('.cover-sheet-footer').getBoundingClientRect().bottom<=innerHeight+1}))
  checks.push({width,kind,...check});if(check.overflow||check.failed.length||!check.footerVisible||check.choices.some(c=>c.height<44||c.width<44))throw Error(JSON.stringify(checks.at(-1)))
  await page.screenshot({path:path.join(out,kind+'-'+width+'.png'),fullPage:!kind.startsWith('picker')})
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,cases:checks.length,checks,native:false},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
