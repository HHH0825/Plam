// Actual component markup/styles, public fixtures only; no deployed service calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const root=path.resolve(process.argv[2]||path.join(__dirname,'../miniprogram')),out=path.resolve(process.argv[3]||path.join(__dirname,'../../test-results/startup-share-20261020/feedback-layout'))
const read=f=>fs.readFileSync(path.join(root,f),'utf8')
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(f),p))))}
async function main(){
 fs.mkdirSync(out,{recursive:true});const file=path.join(out,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{const page=await browser.newPage();await page.goto(pathToFileURL(file).href);await require('./verify-member-tools.cjs').renderer(page)
  const markup=read('components/cat-feedback/index.wxml').replace(/<cat-loading\b[^>]*\/>/g,'').replace(/<(view|image)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(view|text|image)(?=[\s>])/g,(_,p,t)=>p+({view:'div',text:'span',image:'img'}[t]))
  const styles=(css('app.wxss')+'\n'+css('components/cat-feedback/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {')
  for(const width of [320,390,430,768])for(const large of [false,true])for(const kind of ['greeting','capacity']){
   const data={greetingOpen:kind==='greeting',capacityOpen:kind==='capacity',greetingArt:'/assets/rewards/good-night.png',sunny:false,model:{greeting:{title:'晚上好呀，喵～',message:'今天也认真收好生活里的小小喜欢了。歇一歇，明天再慢慢记录。'},checkin:{today_claimed:false,today_reward:5}},capacity:{used:220,free_limit:220}}
   await page.setViewportSize({width,height:844});await page.evaluate(a=>render(...a),[markup,styles,data,pathToFileURL(root).href]);if(large)await page.evaluate(()=>{for(const n of document.querySelectorAll('.cat-dialog-title,.cat-dialog-copy,.cat-dialog-text,.cat-dialog-button'))n.style.fontSize=parseFloat(getComputedStyle(n).fontSize)*1.3+'px'})
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
   const state=await page.evaluate(()=>{const r=document.querySelector('.cat-dialog').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,dialog:{left:r.left,right:r.right,height:r.height},close:document.querySelector('.cat-dialog-close').getBoundingClientRect().height,broken:[...document.images].filter(i=>!i.naturalWidth).length}})
   assert.equal(state.overflow,false);assert.ok(state.dialog.left>=0&&state.dialog.right<=width+1);assert.ok(state.close>=44);assert.equal(state.broken,0);checks.push({width,large,kind,...state})
   if(width===390&&!large||width===320&&large)await page.screenshot({path:path.join(out,kind+'-'+width+(large?'-large':'')+'.png')})
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,native:false,fixtureOnly:true,checks},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
