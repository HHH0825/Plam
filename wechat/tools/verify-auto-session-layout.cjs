// Offline responsive checks of actual WXML/WXSS. Native evidence is separate.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/auto-session-20261025'),base=pathToFileURL(root).href
const read=f=>fs.readFileSync(path.join(root,f),'utf8')
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.join(path.posix.dirname(f),s)))}
function markup(f){return read(f).replace(/<include\s+src=["']([^"']+)["']\s*\/>/g,(_,s)=>markup(path.posix.join(path.posix.dirname(f),s)))}
function model(route){let definition;const file=path.join(root,route+'.js'),local=createRequire(file);vm.runInNewContext(read(route+'.js'),{require:n=>n.endsWith('/member')?{wrap:d=>d}:local(n),Page:d=>definition=d,getApp:()=>({globalData:{token:''}}),wx:{},console});return {...definition,data:structuredClone(definition.data),setData(p){Object.assign(this.data,p)}}}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'offline-preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const p=await browser.newPage();await p.goto(pathToFileURL(entry).href);const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start);await new Function('page','return(async()=>{'+helper.slice(start,end).replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')+'})()')(p)
 for(const[label,route]of [['startup','pages/items/index'],['failure','pages/items/index'],['about','pages/login/about'],['profile','pages/profile/index']])for(const[width,height,large]of [[320,844,false],[390,844,false],[430,844,false],[768,1024,false],[390,568,false],[320,844,true]]){
  let data
  if(label==='about'){const m=model(route);m.updateLayout({windowWidth:width,windowHeight:height});data=m.data}
  else if(label==='profile'){data=model(route).data;Object.assign(data,{user:{id:990001,username:'示例猫咪',avatar_key:'cat'},accountId:'990001',name:'示例猫咪',avatarPath:'/assets/paper/avatar-cat.png',loading:false,loaded:true})}
  else data={entryBlocked:true,sessionHome:true,sessionBlocked:true,sessionBusy:label==='startup',sessionError:label==='failure'?'连接失败，请检查网络后重试':'',items:[],shown:[],categories:[],sortLabels:[],statusOptions:[]}
  let template=markup(route+'.wxml').replace(/<(view|block|image|input|paper-background|cat-loading|cat-feedback|session-status)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(scroll-view|view|picker|block|text|image)(?=[\s>])/g,(_,pre,tag)=>pre+({'scroll-view':'wx-scroll',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[tag]))
  const styles=(css('app.wxss')+'\n'+css(route+'.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img')+'\ninput{font-size:inherit;width:100%;box-sizing:border-box}wx-scroll{display:block}'
  await p.setViewportSize({width,height});await p.evaluate(args=>render(...args),[template,styles,data,base]);if(large)await p.evaluate(()=>{const nodes=[...document.querySelectorAll('.page div,.page span,.page button,.startup-entry *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const[n,size]of nodes)n.style.fontSize=size*1.3+'px'})
  await p.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
  const audit=await p.evaluate(()=>({bodyWidth:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),buttons:[...document.querySelectorAll('button')].map(n=>({text:n.textContent,height:n.getBoundingClientRect().height}))}));assert.equal(audit.bodyWidth,width,label+' overflow');assert.deepEqual(audit.broken,[],label+' missing art');assert.ok(audit.buttons.every(b=>b.height>=44),label+' small button')
  await p.screenshot({path:path.join(out,label+'-'+width+(large?'-large':height===568?'-short':'')+'-offline.png'),fullPage:true});checks.push({label,width,height,large,passed:true,...audit})
 }
 fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,nativeRuntime:false,source:'actual WXML/WXSS and isolated models',remoteBusinessWrites:0},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
