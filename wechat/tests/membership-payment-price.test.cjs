const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
function harness(response){
 let definition;const calls=[],modals=[],app={globalData:{token:'alice',user:{id:1}},requireSession:()=>true},member={wrap:d=>d,load:async()=>structuredClone(response),promotion:r=>r.promotion?.active?r.promotion:null,reset(){}}
 const context={setTimeout,clearTimeout,require:n=>n.endsWith('/cloud-transport')?{serviceScope:()=> 'isolated'}:require(n),module:{exports:{}},getApp:()=>app,wx:{getStorageSync(){},setStorageSync(){}}};vm.runInNewContext('(function(){'+fs.readFileSync(require.resolve('../miniprogram/pages/membership/lib/member-announcement'),'utf8')+'\n})()',context);
 const announcement=context.module.exports;context.module={exports:{}};vm.runInNewContext('(function(){'+fs.readFileSync(require.resolve('../miniprogram/utils/member-announcement-motion'),'utf8')+'\n})()',context);const motion=context.module.exports;
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/membership/index.js'),'utf8'),{
  require:n=>n.endsWith('/member-announcement-motion')?motion:n.endsWith('/member-announcement')?announcement:n.endsWith('/member')?member:n.endsWith('/virtual-payment')?{buy:async(...args)=>{calls.push(args);return {kind:'cancelled'}},checkPending:async()=>response.pendingOrder,history:async()=>response.orders||[]}:n.endsWith('/navigation')?{navigate(){},resetNavigation(){}}:{},
  Page:d=>definition=d,getApp:()=>app,wx:{showModal:o=>modals.push(o),showToast(){}},Date
 })
 const page={...definition,data:structuredClone(definition.data),_visible:true,setData(p){Object.assign(this.data,p)}}
 return {page,calls,modals,app,member}
}
const plans=[{id:'month',name:'月会员',months:1,price_cents:390},{id:'quarter',name:'季会员',months:3,price_cents:990}]

test('iOS current catalog and historical year order retain their distinct real prices',async()=>{
 const h=harness({supported:true,payment_open:true,ios_payment_open:true,plans:plans.map((p,i)=>({...p,price_cents:[450,1150][i]})),
  orders:[{id:'IOS-ORDER',platform:'ios',plan_id:'year',price_cents:3390,status:'fulfilled'}]})
 await h.page.load();assert.equal(h.page.data.selectedPlan.price,'4.5')
 const info=require('../miniprogram/pages/member-benefits/lib/member-benefits').service(h.page.data.membership);assert.match(info.catalog,/11\.50/);assert.doesNotMatch(info.catalog,/年会员/)
 await h.page.orders();assert.match(h.modals[0].content,/苹果.*33\.90/);assert.match(h.modals[0].content,/App Store购买记录/)
})
test('normal plans keep original amounts and selected footer follows the actual selection',async()=>{
 const h=harness({supported:true,payment_open:true,plans});await h.page.load()
 assert.equal(h.page.data.selectedPlan.id,'month');assert.equal(h.page.data.selectedPlan.price,'3.9')
 h.page.select({currentTarget:{dataset:{id:'quarter'}}});assert.equal(h.page.data.selectedPlan.price,'9.9')
 await h.page.buy();assert.deepEqual(h.calls[0],['quarter',undefined,990])
})
test('small real payment shows 0.01, selects the only plan, and sends the displayed amount to checkout',async()=>{
 const h=harness({supported:true,payment_open:true,payment_test:true,payment_test_mode:true,plans:[{...plans[0],name:'月会员测试',price_cents:1}]})
 await h.page.load();assert.equal(h.page.data.selected,'month');assert.equal(h.page.data.selectedPlan.price,'0.01')
 await h.page.buy();assert.deepEqual(h.calls[0],['month',undefined,1])
 const info=require('../miniprogram/pages/member-benefits/lib/member-benefits').service(h.page.data.membership);assert.match(info.catalog,/0\.01/);assert.match(info.catalog,/真实扣款/)
})
test('unsupported or unavailable membership cannot initiate checkout',async()=>{
 for(const supported of [true,false]){
  const h=harness({supported,payment_open:false,plans});await h.page.load();await h.page.buy();assert.equal(h.calls.length,0)
 }
})

test('absent test order explanation does not claim it was cancelled or unpaid',async()=>{
 const h=harness({pendingOrder:{status:'pending',lookup_state:'not_found',can_purchase_again:true}})
 await h.page.checkPayment();assert.match(h.page.data.paymentNote,/原单继续核对/)
 assert.doesNotMatch(h.page.data.paymentNote,/尚未付款|已关闭|已取消/)
})

test('active paid or gifted membership blocks all selections and checkout even when payments are open',async()=>{
 for(const payment_open of [true,false]){
  const h=harness({supported:true,active:true,payment_open,plans});await h.page.load();h.page.select({currentTarget:{dataset:{id:'quarter'}}});assert.equal(h.page.data.selected,'month');await h.page.buy();assert.equal(h.calls.length,0)
 }
})
test('ownership changed after page load prevents checkout when purchase is pressed',async()=>{
 const r={supported:true,active:false,payment_open:true,plans},h=harness(r);await h.page.load();r.active=true;await h.page.buy();assert.equal(h.calls.length,0);assert.match(h.page.data.paymentNote,/已拥有/)
})
test('price changed since display requests a fresh confirmation without calling payment',async()=>{
 const r={supported:true,active:false,payment_open:true,plans:structuredClone(plans)},h=harness(r);await h.page.load();r.plans[0].price_cents=490;await h.page.buy();assert.equal(h.calls.length,0);assert.match(h.page.data.paymentNote,/价格已更新/);assert.equal(h.page.data.selectedPlan.price_cents,490)
})

test('announcement opens on first successful read, closes, and can be reopened without buying',async()=>{
 const h=harness({supported:true,active:true,plans,promotion:{active:true,description:'说明',feedback_message:'反馈'}});h.page.onShow();await new Promise(r=>setImmediate(r));assert.equal(h.page.data.announcementOpen,true);h.page.closeAnnouncement();h.page.onHide();h.page.onShow();await new Promise(r=>setImmediate(r));assert.equal(h.page.data.announcementOpen,false);h.page.openAnnouncement();assert.equal(h.page.data.announcementOpen,true);assert.equal(h.calls.length,0)
 let finish;h.member.load=()=>new Promise(r=>finish=r);h.app.globalData.token='bob';h.app.globalData.user={id:2};h.page.onShow();assert.equal(h.page.data.announcementOpen,false);assert.equal(h.page.data.feedbackMessage,'');finish({supported:false});await new Promise(r=>setImmediate(r));assert.equal(h.page.data.announcementOpen,false)
})
test('retired promotion keeps only feedback, unsupported state clears notice and cached expiry',async()=>{
 const h=harness({supported:true,plans,promotion:{active:false,feedback_message:'继续完善'}});await h.page.load();assert.equal(h.page.data.promotion,undefined);assert.equal(h.page.data.feedbackMessage,'继续完善');assert.equal(h.page.data.selectedPlan.price,'3.9');h.page.presentMembership({supported:false});assert.equal(h.page.data.feedbackMessage,'');assert.equal(h.page.data.announcementOpen,false)
})
test('new page ignores a stale annual catalog entry',async()=>{
 const h=harness({supported:true,plans:[...plans,{id:'year',months:12,price_cents:2990}]});await h.page.load();assert.deepEqual(Array.from(h.page.data.plans,p=>p.id),['month','quarter']);h.page.select({currentTarget:{dataset:{id:'year'}}});assert.equal(h.page.data.selected,'month')
})
