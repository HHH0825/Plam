const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const helper=require('./verify-member-tools.cjs'),{render,audit}=require('./verify-rewards.cjs'),out=path.resolve(__dirname,'../docs/images/growth-20261018')
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../test-results/growth-fixture.json'),'utf8')).responses
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preview.html'),'<!doctype html><meta charset="utf-8"><body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']}),checks=[]
 try{
  const p=await browser.newPage();await p.goto(pathToFileURL(path.join(out,'preview.html')).href);await helper.renderer(p)
  const model=fixture['/rewards'],days=model.checkin.days.map((d,i)=>({...d,label:'第'+(i+1)+'天'}))
  for(const [width,large] of [[320,false],[390,false],[430,false],[768,false],[320,true],[390,true]]){
   for(const tab of ['visits','items','ledger']){
    const rows=model.achievements.filter(r=>r.category===tab).map(r=>({...r,unit:tab==='visits'?'天':tab==='items'?'件':'笔',percent:Math.min(100,100*r.progress/r.target)}))
    await render(p,'pages/rewards/index',{model,days,inviteCode:model.invitation.code,loading:false,busy:false,error:'',inviteError:'',exchangeOpen:false,historyOpen:false,growthTab:tab,growthRows:rows,claimedFlash:'',claiming:'',capacityPercent:100,memberThemeStyle:'',memberThemeClass:''},width,large)
    const name=`growth-${tab}-${width}${large?'-large':''}`;checks.push({name,...await audit(p,name)});assert.equal(await p.locator('.growth-row').count(),tab==='visits'?4:5)
    assert.match(await p.locator('.task-copy').last().innerText(),/0\/3/);assert.match(await p.locator('.task-copy').nth(1).innerText(),/100/)
    await p.locator('.growth-card').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,name+'.png')})
    if(width===390&&!large&&tab==='visits'){await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,'shop-top-390.png')});await p.screenshot({path:path.join(out,'shop-full-390.png'),fullPage:true})}
   }
   const m={...fixture['/membership'],supported:true};await render(p,'pages/membership/index',{loading:false,error:'',membership:m,feedbackMessage:m.promotion.feedback_message,plans:m.plans.map(r=>({...r,price:(r.price_cents/100).toFixed(1),unit:r.months===1?'月':'季'})),selected:'month',selectedPlan:m.plans[0],expiry:'',buying:false,paymentNote:'',announcementOpen:false,features:[{mode:'books',icon:'/assets/membership/books.png',title:'多账本 · 流水整理',note:'整理不同账本的流水'},{mode:'budgets',icon:'/assets/membership/budget.png',title:'月度预算 · 分类预算',note:'花销心中有数'}]},width,large)
   const name=`membership-${width}${large?'-large':''}`;checks.push({name,...await audit(p,name)});assert.doesNotMatch(await p.locator('body').innerText(),/初创|特惠|2027\.01\.01/)
   await p.locator('.member-rights-heading').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,name+'.png')})
  }
  for(const [state,kind] of [['active','active'],['free','free'],['error','error']]){
   const me=await helper.state('me',kind);me.memberToolsExpanded=false;await helper.render(p,'me',me,390,false);assert.equal(await p.locator('.member-startup-badge,.member-startup-date').count(),0);await p.screenshot({path:path.join(out,`me-${state}-390.png`),fullPage:true});checks.push({name:'me-'+state,passed:true})
  }
  fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:true,checks,fixtureOnly:true,cloudWrites:0,realDevice:false},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
