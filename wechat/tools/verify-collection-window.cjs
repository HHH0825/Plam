const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),{render,audit}=require('./verify-rewards.cjs'),out=path.resolve(__dirname,'../docs/images/collection-window-20261018')
const model=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/growth-fixture.json'),'utf8')).responses['/rewards']
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preview.html'),'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']}),checks=[]
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(path.join(out,'preview.html')).href);await helper.renderer(p)
  const days=model.checkin.days.map((d,i)=>({...d,label:'第'+(i+1)+'天'})),base={model,days,loading:false,busy:false,error:'',inviteError:'',inviteCode:model.invitation.code,capacityPercent:100,exchangeOpen:false,historyOpen:false,growthOpen:false,growthTab:'visits',growthLoading:false,growthError:'',growthReady:true,growthClaimed:1,growthPending:model.achievements.filter(r=>r.achieved&&!r.claimed).length,claimedFlash:'',claiming:'',memberThemeClass:'',memberThemeStyle:''}
  for(const [width,large] of [[320,false],[390,false],[430,false],[768,false],[320,true],[390,true]]){
   await render(p,'pages/rewards/index',base,width,large);let name=`entry-${width}${large?'-large':''}`;checks.push({name,...await audit(p,name)})
   assert.equal(await p.locator('.growth-row,.growth-tabs,.growth-dialog').count(),0)
   const position=await p.evaluate(()=>({tasks:document.querySelector('.tasks-card').getBoundingClientRect().bottom,entry:document.querySelector('.growth-entry').getBoundingClientRect(),shop:document.querySelector('.shop-heading').getBoundingClientRect().top}));assert.ok(position.tasks<=position.entry.top&&position.entry.bottom<=position.shop);assert.ok(position.entry.height>=56)
   await p.locator('.growth-entry').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,name+'.png')});if(width===390&&!large)await p.screenshot({path:path.join(out,'page-390.png'),fullPage:true})
   for(const tab of ['visits','items','ledger'])for(const state of tab==='visits'?['ready','loading','error','claiming']:['ready']){
    const rows=model.achievements.filter(r=>r.category===tab).map(r=>({...r,unit:tab==='visits'?'天':tab==='items'?'件':'笔',percent:Math.min(100,100*r.progress/r.target)}))
    await render(p,'pages/rewards/index',{...base,growthOpen:true,growthTab:tab,growthRows:rows,growthLoading:state==='loading',growthError:state==='error'?'网络暂时断开，请重试读取收藏册，已有成长记录仍保留。':'',busy:state==='claiming',claiming:state==='claiming'?'visits_7':''},width,large)
    name=`window-${tab}-${state}-${width}${large?'-large':''}`;checks.push({name,...await audit(p,name)})
    const r=await p.evaluate(()=>{const n=document.querySelector('.growth-dialog'),s=document.querySelector('.growth-scroll'),c=document.querySelector('.growth-close'),h=document.querySelector('.growth-heading');return {rect:n.getBoundingClientRect().toJSON(),height:innerHeight,overflow:n.scrollWidth>n.clientWidth+1,close:c.getBoundingClientRect().toJSON(),head:h.getBoundingClientRect().toJSON(),scroll:s.clientHeight,scrollHeight:s.scrollHeight}})
    assert.ok(!r.overflow&&r.rect.height<=r.height*.8+1&&r.rect.top>=0);assert.ok(r.close.height>=44&&r.scroll>100);assert.equal(await p.locator('.growth-row').count(),tab==='visits'?4:5)
    await p.locator('.growth-scroll').evaluate(n=>n.scrollTop=300);const head=await p.locator('.growth-heading').boundingBox();assert.ok(Math.abs(head.y-r.head.y)<1)
    await p.locator('.growth-scroll').evaluate(n=>n.scrollTop=0);await p.screenshot({path:path.join(out,name+'.png')})
   }
  }
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,fixtureOnly:true,cloudWrites:0,realDevice:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
