// Read-only example rendering of actual templates, styles and local assets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,process.argv.includes('--profile-id')?'../docs/images/profile-user-id-20261016':'../docs/images/theme-refresh-20261014'),base=pathToFileURL(root).href,read=f=>fs.readFileSync(path.join(root,f),'utf8')
const layout=require('../miniprogram/pages/login/lib/layout'),ledger=require('../miniprogram/utils/ledger'),calendar=require('../miniprogram/utils/ledger-calendar'),monthly=require('../miniprogram/utils/monthly'),profile=require('../miniprogram/utils/profile'),cashFixture=require('../tests/fixtures/cash-redesign.cjs')
const css=f=>read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))
const markup=f=>read(f).replace(/<include src="([^"]+)"\s*\/>/g,(_,s)=>markup(path.posix.normalize(path.posix.join(path.posix.dirname(f),s))))
function def(name){let value;const file=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:d=>value=d,wx:{},getApp:()=>({globalData:{}})});return value.data||{}}
function data(name,width,height,tag){const d={...def(name),loading:false,error:''}
 if(name==='login')Object.assign(d,layout.welcomeLayout({windowWidth:width,windowHeight:height}),{devLogin:false,busy:tag==='busy',error:tag==='error'?'登录失败，请重试。':''},tag==='missing'?{logoFailed:true,titleFailed:true,heroFailed:true,cameraFailed:true,foodFailed:true,featureFailed:true,decorFailed:true}:{})
 if(name==='statistics')Object.assign(d,{view:tag==='items'?'items':'cash',month:'2026-10',monthLabel:'2026年10月',supported:true,enabled:true,summary:ledger.summary(cashFixture.stats.summary),calendarCells:calendar.cells('2026-10',[],'2026-10-14','2026-10-14'),selectedLabel:'10月14日 · 星期三',dayEntries:[],cashAnalysis:null,dayLoading:false,itemStatsLoading:false,itemInsightsLoading:false})
 if(name==='insights')Object.assign(d,{statsLoading:false,cardsLoading:false,monthlyLoading:false,cards:[]})
 if(name==='profile')Object.assign(d,{loaded:true,user:{id:73,username:'微信用户',avatar_key:'cat'},accountId:tag==='missing'?'':tag==='long'?'9007199254740991':'73',name:'微信用户',...profile.avatarState({avatar_key:'cat'})})
 if(name==='items'||name==='disposed')Object.assign(d,{items:tag==='search'?[{id:1}]:[],shown:[],listReady:true,loading:false,total:0})
 if(name==='monthly'){const report=require('../tests/fixtures/monthly-balance.cjs').find(r=>r.key==='empty').report;Object.assign(d,{report,edition:monthly.presentMonthly(report),reportStyle:monthly.reportPageStyle(width)})}
 if(name==='ledger')Object.assign(d,{supported:true,enabled:false,loading:false})
 return d
}
async function main(){fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(entry).href);const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start);await new Function('page','return(async()=>{'+helper.slice(start,end).replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')+'})()')(page)
 await require('./white-nav-preview.cjs')(page,root)
 const sizes=[[320,568,false],[390,844,false],[430,844,false],[768,900,false],[390,568,false],[320,568,true]],cases=[]
 for(const name of ['login','statistics'])for(const tag of name==='login'?['main']:['cash','items'])for(const s of sizes)cases.push([name,tag,...s])
 for(const [tag,width]of [['missing',320],['missing',390],['busy',390],['error',390]])cases.push(['login',tag,width,844,false])
 for(const name of ['insights','editor','profile','record','trash','support','monthly','ledger','items','disposed'])cases.push([name,'main',390,844,false])
 cases.push(['items','search',390,844,false])
 cases.push(['statistics','missing',390,844,false])
 if(process.argv.includes('--login-only'))for(let i=cases.length-1;i>=0;i--)if(cases[i][0]!=='login')cases.splice(i,1)
 if(process.argv.includes('--profile-id')){cases.length=0;for(const s of sizes)cases.push(['profile','long',...s]);cases.push(['profile','main',390,844,false],['profile','missing',320,568,false])}
 for(const [name,tag,width,height,large]of cases){
  await page.setViewportSize({width,height});const scope=data(name,width,height,tag)
  let template=markup('pages/'+name+'/index.wxml'),templates={};read('templates/ledger.wxml').replace(/<template name="([^"]+)">([\s\S]*?)<\/template>/g,(_,n,b)=>templates[n]=b)
  template=template.replace(/<import[^>]+\/>/g,'').replace(/<template([^>]*?)is="([^"]+)"[^>]*?\/>/g,(_,a,n)=>'<block'+a+'>'+templates[n]+'</block>')
  template=template.replace(/<(view|block|image|input|canvas|switch|paper-background)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(scroll-view|view|picker|block|text|image)(?=[\s>])/g,(_,p,t)=>p+({'scroll-view':'wx-scroll',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[t]))
  let style=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img').replace(/\bscroll-view\b/g,'wx-scroll')+'\nwx-scroll{display:block;overflow-x:auto;max-width:100%;min-width:0}'
  await page.evaluate(args=>render(...args),[template,style,scope,base]);await page.evaluate(({name,base})=>{const native=document.createElement('div');native.className='native-bar';native.textContent=(name==='statistics'?'统计':'猫爪物帐')+' · 本地隔离验收';document.body.prepend(native);if(['statistics','items'].includes(name))mountWhiteNav('pages/'+name+'/index',base)},{name,base})
  if(name==='statistics'&&tag==='missing')await page.evaluate(()=>document.querySelectorAll('.statistics-view-switch img').forEach((im,i)=>im.src='file:///qa-missing-switch-'+i+'.png'))
  if(large)await page.evaluate(()=>{const all=[...document.querySelectorAll('.page div,.page span,.page button,.page input,.page wx-scroll')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);all.forEach(([n,size])=>n.style.fontSize=size*1.3+'px')})
  await page.evaluate(()=>Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
  const result=await page.evaluate(({name})=>({overflow:document.documentElement.scrollWidth>innerWidth,failed:[...document.images].filter(i=>i.getAttribute('src')&&!i.naturalWidth).map(i=>i.getAttribute('src')),controls:[...document.querySelectorAll('.login-button,.statistics-view-switch>button,.account-id-copy')].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),money:[...document.querySelectorAll('.sample-ledger-money')].map(n=>({width:n.clientWidth,scroll:n.scrollWidth})),cats:[...document.images].filter(n=>/cat-(search|book|camera)/.test(n.getAttribute('src')||'')).map(n=>n.getAttribute('src'))}),{name})
  if(name==='profile'){
   const profileCheck=await page.evaluate(()=>{const card=document.querySelector('.account-id-card'),fields=[...document.querySelectorAll('.profile-form .field')];return {visible:!!card&&card.getBoundingClientRect().height>0,beforeName:fields[0]===card,extraNote:!!document.querySelector('.account-id-note'),copy:!!document.querySelector('.account-id-copy')}})
   if(!profileCheck.visible||!profileCheck.beforeName||profileCheck.extraNote||!profileCheck.copy)throw Error('Profile ID content missing or incorrectly placed: '+JSON.stringify(profileCheck))
   result.profileId=profileCheck
  }
  const expectedMissing=name==='statistics'&&tag==='missing'&&result.failed.length===2&&result.failed.every(s=>s.includes('qa-missing-switch-'))
  if(result.overflow||result.failed.length&&!expectedMissing||result.controls.some(r=>r.width<44||r.height<44)||result.money.some(r=>r.scroll>r.width+1))throw Error(JSON.stringify({name,tag,width,height,large,...result}))
  if(expectedMissing){const ok=await page.evaluate(()=>[...document.querySelectorAll('.statistics-view-switch>button')].every(b=>{const r=b.getBoundingClientRect();return !!b.textContent.trim()&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b}));if(!ok)throw Error('Missing icons obstruct switch buttons')}
  const label=`${name}-${tag}-${width}-${height}${large?'-large':''}`;await page.screenshot({path:path.join(out,label+'.png'),fullPage:true})
  if(width===390&&height===844&&!large&&name==='login'&&tag==='main'){
   const rects=await page.evaluate(()=>{const top=document.querySelector('.page').getBoundingClientRect().top;return Object.fromEntries(['.brand','.title-art','.subtitle','.welcome-art','.sample-card','.feature-hints','.login-button','.welcome-note'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{x:r.x,y:r.y-top,width:r.width,height:r.height}]}))});fs.writeFileSync(path.join(out,'login-geometry-browser.json'),JSON.stringify(rects,null,2));await page.screenshot({path:path.join(out,'login-content-browser.png'),clip:{x:0,y:56,width:390,height:729}})
  }
  if(width===390&&height===844&&!large&&name==='statistics'){await page.locator('.statistics-view-switch').screenshot({path:path.join(out,'switch-'+tag+'-browser.png')});const r=await page.locator('.statistics-view-switch').boundingBox();fs.writeFileSync(path.join(out,'switch-'+tag+'-geometry-browser.json'),JSON.stringify(r,null,2))}
  checks.push({name,tag,width,height,large,...result})
 }
 fs.writeFileSync(path.join(out,process.argv.includes('--login-only')?'browser-results-login-final.json':'browser-results.json'),JSON.stringify({passed:true,cases:checks.length,native:false,fixtureOnly:true,remoteWrites:0,checks},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }catch(e){await browser.contexts()[0]?.pages()[0]?.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw e}finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
