// Current compiled-project markup, fictional profile, no business requests.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../../test-results/local-builds/local-source'),out=path.resolve(__dirname,'../../test-results/local-me-layout-20261106'),read=n=>fs.readFileSync(path.join(root,n),'utf8')
function css(n){return read(n).replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.join(path.posix.dirname(n),p)))}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 try{const page=await browser.newPage();await page.goto(pathToFileURL(entry).href)
  const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start)
  await new Function('page','return(async()=>{'+helper.slice(start,end).replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')+'})()')(page)
  const template=read('pages/me/index.wxml').replace(/<include[^>]+\/>/g,'').replace(/<(view|block|image)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(view|block|text|image|scroll-view)(?=[\s>])/g,(_,p,t)=>p+({view:'div',block:'wx-block',text:'span',image:'img','scroll-view':'div'}[t]))
  const styles=(css('app.wxss')+'\n'+css('pages/me/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {')
  const data={localMode:true,user:{username:'示例猫咪'},loading:false,error:'',statsLoading:false,statsCompatible:true,ageCompatible:true,heldItems:'26',heldAmount:'1,299.90',heldAmountDisplay:'1,299.90',accountDays:'128',avatarPath:'/assets/paper/avatar-cat.png',amountLayout:{kind:'regular',height:30,size:20},amountSizes:[],cashMonthNumber:11,cashSupported:true,cashEnabled:true,cashLoading:false,cashLayout:{size:20,stacked:false},cashSizes:[],cash:[{key:'expense',display:'¥124.00',label:'支出'},{key:'income',display:'¥500.00',label:'收入'},{key:'net',display:'¥376.00',label:'结余'}],memberCard:{kind:'free'},memberTools:require('../miniprogram/utils/member-card').tools}
  const cases=[['pending','尚未外部备份','warning'],['saved','已备份 2026/11/06','ready'],['changed','有新资料，待备份','warning'],['error','状态未读取，点此管理','error']],checks=[]
  for(const [name,label,tone]of cases)for(const [width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   await page.setViewportSize({width,height:844});await page.evaluate(args=>render(...args),[template,styles,{...data,backupStatusText:label,backupStatusTone:tone},pathToFileURL(root).href])
   if(large)await page.evaluate(()=>{const nodes=[...document.querySelectorAll('.me-page div,.me-page span,.me-page button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,size]of nodes)n.style.fontSize=size*1.3+'px'})
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
   const audit=await page.evaluate(()=>{const bar=document.querySelector('#menu-backup'),tools=[...document.querySelectorAll('[id^="member-tool-"]')],group=document.querySelector('#menu-appearance').closest('.menu-group');return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,backupHeight:bar.getBoundingClientRect().height,backupBelowMenus:bar.getBoundingClientRect().top>=document.querySelector('#menu-feedback').getBoundingClientRect().bottom,toolsAlwaysVisible:tools.length===2&&tools.every(t=>t.getBoundingClientRect().height>=44&&t.closest('.menu-group')===group),overflow:[...document.querySelectorAll('.menu-group,.backup-status')].filter(n=>n.scrollWidth>n.clientWidth+2||n.getBoundingClientRect().right>innerWidth+1).map(n=>n.className),missingImages:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src)}})
   if(audit.scrollWidth>width+1||audit.backupHeight<44||!audit.backupBelowMenus||!audit.toolsAlwaysVisible||audit.overflow.length||audit.missingImages.length)throw Error(JSON.stringify({name,large,...audit}))
   if(width===390||large)await page.screenshot({path:path.join(out,name+'-'+width+(large?'-large':'')+'.png'),fullPage:true})
   checks.push({name,large,...audit})
  }
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({fixtureOnly:true,native:false,checks},null,2));console.log(JSON.stringify({passed:checks.length,out}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
