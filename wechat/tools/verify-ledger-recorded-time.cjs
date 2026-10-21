// Actual templates/styles with isolated examples. Browser screenshots are not WeChat screenshots.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const fixture=require('./ledger-recorded-time-fixtures.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/ledger-recorded-time-20261015'),base=pathToFileURL(root).href
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),css=f=>read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))
function initial(name){let value;const file=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:d=>value=d,wx:{},getApp:()=>({globalData:{}})});return value.data}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(entry).href)
  const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start)
  await new Function('page','return(async()=>{'+helper.slice(start,end).replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')+'})()')(page)
  await require('./white-nav-preview.cjs')(page,root)
  for(const name of ['ledger','statistics','ledger-detail'])for(const[width,height,large]of [[320,568,false],[390,844,false],[430,844,false],[768,900,false],[390,568,false],[320,568,true]]){
   await page.setViewportSize({width,height});const data=fixture.present(name,initial(name));let template=read('pages/'+name+'/index.wxml'),templates={}
   read('templates/ledger.wxml').replace(/<template name="([^"]+)">([\s\S]*?)<\/template>/g,(_,n,b)=>templates[n]=b)
   template=template.replace(/<import[^>]+\/>/g,'').replace(/<template([^>]*?)is="([^"]+)"[^>]*?\/>/g,(_,a,n)=>'<block'+a+'>'+templates[n]+'</block>')
   template=template.replace(/<(view|block|image|input|canvas|switch)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(scroll-view|view|picker|block|text|image)(?=[\s>])/g,(_,p,t)=>p+({'scroll-view':'wx-scroll',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[t]))
   const style=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img').replace(/\bscroll-view\b/g,'wx-scroll')+'\nwx-scroll{display:block;overflow-x:auto;max-width:100%;min-width:0}'
   await page.evaluate(args=>render(...args),[template,style,data,base])
   await page.evaluate(({name,base})=>{const bar=document.createElement('div');bar.className='native-bar';bar.textContent=(name==='ledger-detail'?'账单详情':name==='ledger'?'记账':'统计')+' · 本地隔离验收';document.body.prepend(bar);if(name!=='ledger-detail')mountWhiteNav('pages/'+name+'/index',base)},{name,base})
   if(large)await page.evaluate(()=>{const sizes=[...document.querySelectorAll('.page div,.page span,.page button,.page wx-scroll')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);sizes.forEach(([n,s])=>n.style.fontSize=s*1.3+'px')})
   await page.evaluate(()=>Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
   const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,missingImages:[...document.images].filter(i=>i.getAttribute('src')&&!i.naturalWidth).map(i=>i.src),times:[...document.querySelectorAll('.ledger-time-part')].map(n=>({value:n.textContent,nowrap:getComputedStyle(n).whiteSpace==='nowrap',overflow:n.scrollWidth>n.clientWidth+1})),lines:[...document.querySelectorAll('.ledger-recorded-time,.ledger-time-value')].map(n=>n.textContent.trim().replace(/\s+/g,' ')),overlapping:[...document.querySelectorAll('.ledger-row')].some(n=>{const copy=n.querySelector('.ledger-row-copy'),amount=n.querySelector('.ledger-row-amount');return copy.getBoundingClientRect().right>amount.getBoundingClientRect().left+1})}))
   if(result.overflow||result.missingImages.length||result.overlapping||result.times.some(t=>!t.nowrap||t.overflow)||!result.times.some(t=>t.value==='14:08:36')||name!=='ledger-detail'&&!result.lines.some(t=>t.includes('记录时间暂不可用')))throw Error(JSON.stringify({name,width,height,large,...result}))
   checks.push({name,width,height,large,...result});await page.screenshot({path:path.join(out,`${name}-${width}-${height}${large?'-large':''}-local.png`),fullPage:true})
  }
  fs.writeFileSync(path.join(out,'local-results.json'),JSON.stringify({passed:true,cases:checks.length,native:false,fixtureOnly:true,remoteWrites:0,checks},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
