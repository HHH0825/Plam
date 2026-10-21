// Synthetic data only; renders production WXML/CSS and the actual PNG painter.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url')
const {chromium}=require('playwright'),{presentMonthly}=require('../miniprogram/utils/monthly'),{pageStyle}=require('../miniprogram/utils/report-design')
const samples=require('../tests/fixtures/monthly-balance.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/monthly-balance-20261012')
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),base=pathToFileURL(root).href
function data(name){let d;const f=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(f,'utf8'),{require:createRequire(f),Page:x=>d=x,wx:{},getApp:()=>({globalData:{}})});return JSON.parse(JSON.stringify(d.data))}
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))}
async function main(){
 fs.mkdirSync(out,{recursive:true});const file=path.join(out,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[],exports=[]
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
  const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start)
  await new Function('page','return(async()=>{'+helper.slice(start,end)+'})()')(page)
  const names=['view','collection','item-cover-catalogue','item-covers','report-design','monthly','report-image']
  await page.evaluate(sources=>{const modules={};function load(name){if(!modules[name]){const module={exports:{}};modules[name]=module.exports;new Function('module','require',sources[name])(module,n=>sources[n.slice(2)]?load(n.slice(2)):{});modules[name]=module.exports}return modules[name]}window.reportModules={load}},Object.fromEntries(names.map(n=>[n,read('utils/'+n+'.js')])))
  for(const sample of samples)for(const width of [320,390,430,768])for(const large of [false,true])for(const name of ['monthly','insights']){
   const {report,key,label,amount}=sample,edition=presentMonthly(report)
   const d={...data(name),loading:false,monthlyLoading:false,cardsLoading:false,statsLoading:false,error:'',monthlyError:'',report,edition,month:report.month,maxMonth:report.month,reportStyle:pageStyle(width),monthly:{...report,page:edition}}
   const template=read('pages/'+name+'/index.wxml').replace(/<canvas[\s\S]*?\/>/g,'').replace(/<(view|block|image)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|picker|scroll-view)(?=[\s>])/g,'div').replace(/\bblock(?=[\s>])/g,'wx-block').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
   const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')
   await page.setViewportSize({width,height:844});await page.evaluate(args=>window.render(...args),[template,styles,d,base])
   if(large)await page.evaluate(()=>{const nodes=[...document.querySelectorAll('span,button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,s]of nodes)n.style.fontSize=s*1.3+'px'})
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
   const check=await page.evaluate(({name,label,amount,empty})=>{
    const node=document.querySelector(name==='monthly'?'.cashflow-row':'.brief-ledger'),words=node?.textContent||'',all=document.body.textContent
    return{overflow:document.documentElement.scrollWidth>innerWidth,failed:[...document.images].filter(i=>!i.naturalWidth).length,label:empty&&name==='monthly'?all.includes('这一页，暂时留白。'):words.includes(label),amount:empty||words.includes('¥'+amount),old:/收支差额|钱花在哪里|¥-/.test(all)}
   },{name,label,amount,empty:!report.has_activity})
   checks.push({key,width,large,name,...check});if(check.overflow||check.failed||!check.label||!check.amount||check.old)throw Error(JSON.stringify(checks.at(-1)))
   if(width===390&&!large&&['recovery','net-expense','balanced','empty','large','principal-only'].includes(key)||width===320&&large&&['recovery','large'].includes(key)||width===768&&key==='net-expense'&&!large)await page.screenshot({path:path.join(out,`${name}-${key}-${width}${large?'-large':''}.png`),fullPage:true})
  }
  for(const {key,report}of samples)for(const cover of [false,true]){
   const result=await page.evaluate(async({report,cover,base})=>{
    const mod=reportModules.load('report-image'),canvas=document.createElement('canvas'),c=canvas.getContext('2d'),layout=mod[cover?'planShareCover':'planReport'](c,report)
    const texts=layout.commands.filter(c=>c.lines),fit=texts.every(t=>{c.font=(t.weight||'normal')+' '+t.size+'px sans-serif';return t.lines.every(s=>c.measureText(s).width<=t.available+.1)&&t.y+t.height<layout.height-24})
    canvas.width=layout.width;canvas.height=layout.height
    const images=new Map();await Promise.all([...new Set(layout.commands.filter(c=>c.src).map(c=>c.src))].map(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>{images.set(src,i);resolve()};i.onerror=reject;i.src=base+src})))
    mod.drawLayout(c,layout,images);return{png:canvas.toDataURL('image/png').split(',')[1],fit,width:layout.width,height:layout.height,words:texts.map(t=>t.lines.join(''))}
   },{report,cover,base})
   fs.writeFileSync(path.join(out,key+(cover?'-cover':'-export')+'.png'),Buffer.from(result.png,'base64'));delete result.png
   exports.push({key,cover,...result});if(!result.fit)throw Error('PNG text exceeds bounds: '+key+' '+cover)
  }
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,fixtureOnly:true,layouts:checks.length,pngs:exports.length,checks,exports},null,2));console.log(JSON.stringify({passed:true,layouts:checks.length,pngs:exports.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
