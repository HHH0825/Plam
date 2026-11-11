// Responsive previews from actual WXML/WXSS and fictional data. Native evidence
// is recorded separately; this renderer does not claim Android/iOS verification.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(__dirname,'../../test-results/local-builds/local-source'),out=path.resolve(__dirname,'../../test-results/local-direct-layout-20261106'),read=n=>fs.readFileSync(path.join(root,n),'utf8')
function css(n){return read(n).replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.join(path.posix.dirname(n),p)))}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(entry).href)
  const helper=fs.readFileSync(path.join(__dirname,'verify-dots-glass.cjs'),'utf8'),start=helper.indexOf(' await page.evaluate(()=>{window.render='),end=helper.indexOf('\n await require(',start)
  await new Function('page','return(async()=>{'+helper.slice(start,end).replace('val(s,loop.slice(2,-2)).entries()','(val(s,loop.slice(2,-2))||[]).entries()')+'})()')(page)
  const template=read('pages/local-data/index.wxml').replace(/(<\/?)(view|block|text)(?=[\s>])/g,(_,pre,tag)=>pre+({view:'div',block:'wx-block',text:'span'}[tag])),styles=(css('app.wxss')+'\n'+css('pages/local-data/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {')
  const local={local:true,busy:false,error:'',transition:true,info:{usedText:'8.4 MB',backupText:'2026/11/6 20:30',remind:true},backup:{name:'catpaw-backup-example.zip'},incoming:{createdAt:'2026-11-06T12:30:00Z',photos:8,countText:'物品: 26；账目: 128；订阅／分期: 3'},candidates:[]}
  const cases=[['local-data',{...local,backup:null,incoming:null}],['recovery',{...local,error:'本机资料暂时无法读取，请核对内部版本或选择完整备份。',info:null,candidates:[{generation:25,time:'2026/11/6 20:30'}]}],['backup-ready',local]]
  const checks=[]
  for(const [name,data]of cases)for(const [width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true]]){
   await page.setViewportSize({width,height:844});await page.evaluate(args=>render(...args),[template,styles,data,pathToFileURL(root).href])
   if(large)await page.evaluate(()=>{const nodes=[...document.querySelectorAll('.local-page div,.local-page button')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const [n,size]of nodes)n.style.fontSize=size*1.3+'px'})
   const audit=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('.card,button')].filter(n=>n.getBoundingClientRect().right>innerWidth+1||n.getBoundingClientRect().left<0||n.scrollWidth>n.clientWidth+2).map(n=>n.className),buttons:[...document.querySelectorAll('button')].map(n=>({text:n.innerText,height:n.getBoundingClientRect().height}))}))
   if(audit.scrollWidth>width+1||audit.overflow.length||audit.buttons.some(b=>b.height<43))throw Error(JSON.stringify({name,large,...audit}))
   if(width===390||large)await page.screenshot({path:path.join(out,name+'-'+width+(large?'-large':'')+'.png'),fullPage:true})
   checks.push({name,large,...audit})
  }
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({date:'2026-11-06',fixtureOnly:true,native:false,checks},null,2));console.log(JSON.stringify({passed:checks.length,out}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
