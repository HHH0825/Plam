const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const model=require('../miniprogram/utils/member-card')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('card distinguishes free, active, expired, unknown and unsupported states',()=>{
 const expiry=Date.UTC(2026,9,15,16,5)/1000
 assert.equal(model.card({active:true,status:'active',expires_at:expiry}).description,'有效期至 2026.10.16')
 assert.equal(model.card({active:true,status:'active',expires_at:expiry}).kind,'active')
 assert.match(model.card({active:true,status:'active',expires_at:expiry}).image,/hero\.png$/)
 assert.equal(model.card({active:false,status:'free'}).badge,'会员订阅')
 assert.equal(model.card({active:false,status:'expired',expires_at:expiry}).action,'续费会员 ›')
 assert.equal(model.card().kind,'loading');assert.equal(model.card(null,true).kind,'error')
 assert.equal(model.card({supported:false}).kind,'unsupported')
 assert.equal(model.card({active:true,expires_at:null}).kind,'error')
 assert.equal(model.beijingDate(Infinity),'');assert.equal(model.beijingDate(1e20),'')
})
function harness(){
 const storage=new Map();const app={globalData:{token:'alice'},requireSession:()=>true},navigation=[],notices=[],timers=[]
 let clock=1000000,respond=async()=>status(),definition
 function Clock(...args){return new Date(...args)}Clock.now=()=>clock
 function status(extra={}){return {active:true,status:'active',expires_at:2000,server_time:clock/1000,entitlements:['books'],plans:[],appearance:{effective:{theme:'default'}},...extra}}
 const api={request:path=>respond(path)},nav={navigate:(_page,url)=>navigation.push(url),resetNavigation(){}}
 const memberModule={exports:{}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/member'),'utf8'),{module:memberModule,require:n=>n==='./api'?api:n==='./payment-platform'?{platform:()=>''}:n==='./navigation'?nav:createRequire(require.resolve('../miniprogram/utils/member'))(n),getApp:()=>app,wx:{showToast:o=>notices.push(o)},Date:Clock,setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){}})
 const file=require.resolve('../miniprogram/pages/me/index'),local=createRequire(file)
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n.endsWith('/member')?memberModule.exports:n.endsWith('/api')?api:n.endsWith('/navigation')?nav:n.endsWith('/me-cash')?{empty:()=>({}),methods:{}}:local(n),Page:d=>definition=d,getApp:()=>app,wx:{showToast:o=>notices.push(o),getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v)}})
 const page={...definition,data:structuredClone(definition.data),route:'pages/me/index',_visible:true,_memberVisible:true,setData(p){Object.assign(this.data,p)}}
 return {page,app,navigation,notices,timers,status,respond:fn=>respond=fn,time:n=>clock=n}
}
test('every successful refresh resolves the card even when membership is unchanged',async()=>{
 const h=harness();await h.page.memberRefresh(true);assert.equal(h.page.data.memberCard.kind,'active')
 await h.page.memberRefresh(true);assert.equal(h.page.data.memberCard.kind,'active')
 assert.equal(h.page.data.memberCard.action,'管理会员 ›')
})
test('read failure shows retry state instead of free or expired and retry restores server state',async()=>{
 const h=harness();await h.page.memberRefresh(true);h.respond(async()=>{throw Error('offline')})
 await h.page.memberRefresh(true);assert.equal(h.page.data.memberCard.kind,'error')
 h.respond(async()=>h.status({active:false,status:'free',expires_at:null}));await h.page.retryMembership()
 assert.equal(h.page.data.memberCard.kind,'free')
})
test('account switching clears the old gold card before the new response and rejects late old data',async()=>{
 const h=harness();await h.page.memberRefresh(true)
 let oldResolve,newResolve;h.respond(()=>new Promise(r=>oldResolve=r));const old=h.page.memberRefresh(true)
 h.app.globalData.token='bob';h.respond(()=>new Promise(r=>newResolve=r));const next=h.page.memberRefresh(true)
 assert.equal(h.page.data.memberCard.kind,'loading')
 oldResolve(h.status());await old;assert.equal(h.page.data.memberCard.kind,'loading')
 newResolve(h.status({active:false,status:'free',expires_at:null}));await next;assert.equal(h.page.data.memberCard.kind,'free')
})
test('crossing expiry refreshes the card into expired state without granting local membership',async()=>{
 const h=harness();await h.page.memberRefresh(true);h.time(2001000)
 h.respond(async()=>h.status({active:false,status:'expired',expires_at:2000}));h.timers.at(-1)();await tick()
 assert.equal(h.page.data.memberCard.kind,'expired');assert.equal(h.page.data.memberActive,false)
})
test('two tools open existing read-only pages for free, active and expired users',()=>{
 for(const status of [{active:false,status:'free'},{active:true,status:'active',expires_at:2000},{active:false,status:'expired',expires_at:2000}]){
  const h=harness();h.page.onMembershipRefreshSuccess(status)
  for(const tool of model.tools)h.page.openMemberTool({currentTarget:{dataset:{mode:tool.mode}}})
  assert.deepEqual(h.navigation,model.tools.map(t=>'/pages/member-tools/index?mode='+t.mode))
  h.page.openMemberTool({currentTarget:{dataset:{mode:'unknown'}}});assert.equal(h.navigation.length,2)
 }
})
test('unsupported backend offers a notice instead of an empty tool page; card still opens membership',async()=>{
 const h=harness();h.respond(async()=>{throw Object.assign(Error('missing'),{status:404})})
 await h.page.memberRefresh(true);assert.equal(h.page.data.memberCard.kind,'unsupported')
 h.page.openMemberTool({currentTarget:{dataset:{mode:'books'}}});assert.equal(h.navigation.length,0)
 assert.match(h.notices.at(-1).title,/暂未开放/);h.page.memberOpen();assert.equal(h.navigation.at(-1),'/pages/membership/index')
})

test('tools collapse by default and expansion preference belongs to one account',()=>{
 const h=harness();assert.equal(h.page.data.memberToolsExpanded,false);h.page.restoreMemberTools({id:1});h.page.toggleMemberTools();assert.equal(h.page.data.memberToolsExpanded,true)
 h.app.globalData.token='bob';h.page.toggleMemberTools();assert.equal(h.page.data.memberToolsExpanded,false);h.page.restoreMemberTools({id:2});assert.equal(h.page.data.memberToolsExpanded,false)
 h.app.globalData.token='alice';h.page.restoreMemberTools({id:1});assert.equal(h.page.data.memberToolsExpanded,true)
})

test('compact identity distinguishes membership states without changing avatar or checkout behavior',()=>{
 const expiry=Date.UTC(2027,10,14,16)/1000
 assert.equal(model.card({active:true,status:'active',expires_at:expiry}).compactTitle,'猫爪会员 · 已开通');assert.equal(model.card({active:true,status:'active',expires_at:expiry}).compactDetail,'有效期至 2027.11.15');assert.equal(model.card({active:false,status:'free'}).compactTitle,'猫爪会员 · 查看权益');assert.equal(model.card({active:false,status:'expired',expires_at:expiry}).compactTitle,'已到期 · 续费会员');assert.match(model.card().compactTitle,/读取中/);assert.match(model.card(null,true).compactTitle,/读取失败/);assert.match(model.card({supported:false}).compactTitle,/暂未开放/)
})
