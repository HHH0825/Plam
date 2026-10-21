// Actual WXML/WXSS and page controllers, backed by isolated fixture responses.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/member-announcement-20261017')
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/announcement-fixture.json'),'utf8')).responses
async function model(name,kind='active',extra={}){
 let definition;const file=path.join(root,'pages',name,'index.js'),local=createRequire(file),app={globalData:{token:'isolated-refine'},requireSession:()=>true}
 const status={...structuredClone(fixture['/membership']),supported:true,active:kind==='active',status:kind==='active'?'active':kind==='expired'?'expired':'free',payment_open:false,purchase_allowed:false,expires_at:kind==='active'?1798761600:kind==='expired'?1791907200:null,server_time:1792123200}
 const api={request:async url=>{let result=fixture[url]||fixture[url.split('?')[0]];if(url.startsWith('/member/budget'))result=extra.budgetResponse||fixture['/member/budget?month=2026-10&book_id=all'];if(!result)throw Error('No fixture: '+url);return structuredClone(result)}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/member-announcement')?{prepare(){},present(){}}:n.endsWith('/member')?{...require('../miniprogram/utils/member'),wrap:d=>d,load:async()=>status,ensure:async()=>kind==='active'}:n.endsWith('/api')?api:n.endsWith('/navigation')?{resetNavigation(){},navigate(){}}:local(n),Page:d=>definition=d,getApp:()=>app,wx:{setNavigationBarTitle(){},disableAlertBeforeUnload(){},enableAlertBeforeUnload(){},showToast(){}},console,setTimeout,clearTimeout})
 const page={...definition,data:structuredClone(definition.data),_visible:true,_seq:1,setData(patch){for(const[k,v]of Object.entries(patch)){const keys=k.split('.');let obj=this.data;while(keys.length>1){const key=keys.shift();obj=obj[key]||(obj[key]={})}obj[keys[0]]=v}}}
 page.onLoad?.({mode:extra.mode||'books',month:'2026-10'});await page.load();Object.assign(page.data,extra)
 return page
}
function css(file){return fs.readFileSync(path.join(root,file),'utf8').replace(/@import\s+["']([^"']+)["'];/g,(_,p)=>css(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))))}
function expanded(file){return fs.readFileSync(path.join(root,file),'utf8').replace(/<import\b[^>]*\/>/g,'').replace(/<include src="([^"]+)"\s*\/>/g,(_,p)=>expanded(path.posix.normalize(path.posix.join(path.posix.dirname(file),p))))}
async function render(page,name,data,width,large){
 const template=expanded('pages/'+name+'/index.wxml').replace(/<(view|block|image|input|canvas|checkbox|progress|paper-background|template|cash-donut|page-meta)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/(<\/?)(scroll-view|checkbox-group|view|picker|block|text|image)(?=[\s>])/g,(_,pre,tag)=>pre+({'scroll-view':'wx-scroll','checkbox-group':'div',view:'div',picker:'div',block:'wx-block',text:'span',image:'img'}[tag]))
 const styles=(css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w:-])image\b(?!\/)/g,'img').replace(/\bscroll-view\b/g,'wx-scroll')+'\nwx-scroll{display:block;overflow-x:auto;max-width:100%}wx-scroll.member-announcement-scroll{overflow-y:auto;overflow-x:hidden}'
 await page.setViewportSize({width,height:844});await page.evaluate(args=>window.render(...args),[template,styles,data,pathToFileURL(root).href])
 if(large)await page.evaluate(()=>{const nodes=[...document.querySelectorAll('.page div,.page span,.page button,.page input')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);nodes.forEach(([n,size])=>n.style.fontSize=size*1.3+'px')})
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))))
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const entry=path.join(out,'preview.html');fs.writeFileSync(entry,'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[]
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(entry).href);await helper.renderer(p)
  const active=(await model('membership')).data,free=(await model('membership','free')).data,expired=(await model('membership','expired')).data
  const variants=[['open',{...free,announcementOpen:true}],['closed',{...free,announcementOpen:false}],['active',{...active,announcementOpen:true}],['expired',{...expired,announcementOpen:true}],['after-offer',{...active,announcementOpen:true,promotion:null,feedbackMessage:'目前部分功能和使用体验仍在完善。如果遇到问题，请通过“反馈与建议”告诉我。感谢你的理解与支持。'}],['loading',{...active,loading:true,announcementOpen:false}],['error',{...active,error:'读取失败，请重试',announcementOpen:false}],['unsupported',{...active,membership:{supported:false},plans:[],promotion:null,feedbackMessage:'',announcementOpen:false}]]
  for(const [width,large]of [[320,false],[390,false],[430,false],[768,false],[320,true],[390,true]]){
   let openTop
   for(const [label,data]of variants){
    await render(p,'membership',data,width,large)
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width,label+' overflow')
    assert.equal(await p.locator('.member-letter-window,.member-letter-peek').count(),0)
    assert.deepEqual(await p.locator('img').evaluateAll(nodes=>nodes.filter(n=>!n.naturalWidth).map(n=>n.src)),[])
    const visible=!!(data.promotion||data.feedbackMessage)&&!data.loading&&!data.error&&data.announcementOpen
    assert.equal(await p.locator('.member-announcement-window').count(),visible?1:0)
    if(visible){
     const bounds=await p.locator('.member-announcement-window').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=844)
     for(const selector of ['.member-announcement-close','.member-announcement-done'])assert.ok(await p.locator(selector).evaluate(n=>n.getBoundingClientRect().height>=44))
     assert.equal(await p.locator('[open-type="feedback"]').count(),1)
     assert.ok(await p.locator('.member-announcement-scroll').evaluate(n=>n.clientHeight>0))
    }
    if(data.membership.supported&&!data.loading&&!data.error){assert.equal(await p.locator('.member-plan').count(),2);assert.ok(!(await p.locator('.member-plans').innerText()).includes('年会员'))}
    if(label==='open')openTop=await p.locator('.member-plans').evaluate(n=>n.getBoundingClientRect().top)
    if(label==='closed'){assert.equal(await p.locator('.member-plans').evaluate(n=>n.getBoundingClientRect().top),openTop);assert.ok(await p.locator('.member-announcement-entry').evaluate(n=>n.getBoundingClientRect().height>=44))}
    if(label==='after-offer')assert.ok(!(await p.locator('.member-announcement-body').innerText()).includes('特惠'))
    await p.screenshot({path:path.join(out,label+'-'+width+(large?'-large':'')+'.png'),fullPage:!visible});checks.push({label,width,large,passed:true})
   }
  }
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,isolated:true,cloudWrites:0},null,2));console.log(JSON.stringify({checks:checks.length,passed:true}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
