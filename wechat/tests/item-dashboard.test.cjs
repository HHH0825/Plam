const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const dashboard=require('../miniprogram/utils/item-dashboard'),ledger=require('../miniprogram/utils/ledger'),api=require('../miniprogram/utils/api'),fixtures=require('./fixtures/item-dashboard.cjs')
const tick=()=>new Promise(r=>setImmediate(r))
function harness(){
 const original=api.request,app={globalData:{token:'dashboard-A',user:{id:1}},requireSession:()=>true},calls=[],scrolls=[]
 global.getApp=()=>app;global.wx={nextTick:f=>f(),pageScrollTo:r=>scrolls.push(r),showModal(){},showToast(){}}
 const d=ledger.tabPage(true),p={...d,data:structuredClone(d.data),setData(patch,cb){Object.assign(this.data,patch);cb?.()}}
 p.onLoad();p._visible=true;p.setData({view:'items'})
 api.request=async path=>{calls.push(path);if(path==='/stats')return fixtures.stats;if(path==='/insights')return fixtures.insights;if(path==='/auth/me')return{capabilities:{cash_ledger:1}};if(path==='/ledger/settings')return{enabled:true};if(path.startsWith('/ledger/statistics'))return{summary:{expense:'0.00',income:'0.00',refund:'0.00',net:'0.00'},days:[],categories:[]};if(path.startsWith('/ledger/entries'))return{date:path.match(/date=([^&]+)/)?.[1],entries:[],next_offset:null};throw Error('Unexpected '+path)}
 return{p,app,calls,scrolls,restore(){p.onUnload();api.request=original}}
}
test('book selection affects only cash statistics and survives pane switching',async()=>{
 const h=harness();try{
  h.p._memberBookId='selected-book';h.p.data.memberBookId='selected-book';await h.p.load();assert.ok(h.calls.every(x=>x==='/stats'||x==='/insights'))
  h.p.switchView({currentTarget:{dataset:{key:'cash'}}});await tick();await tick();assert.ok(h.calls.some(x=>x.startsWith('/ledger/statistics?')&&x.includes('book_id=selected-book')))
  const start=h.calls.length;h.p.switchView({currentTarget:{dataset:{key:'items'}}});await tick();await tick();assert.ok(h.calls.slice(start).every(x=>x==='/stats'||x==='/insights'));assert.equal(h.p._memberBookId,'selected-book')
  h.p.switchView({currentTarget:{dataset:{key:'cash'}}});await tick();await tick();assert.equal(h.p.data.memberBookId,'selected-book')
 }finally{h.restore()}
})
test('cost display preserves signed exact totals; categories sort and merge without losing cents',()=>{
 const data=dashboard.presentStats(fixtures.stats);assert.equal(data.netText,'17,279.90');assert.equal(data.breakdown[2].text,'30.00');assert.equal(data.states[0].text,'5')
 const rows=[{name:'大类',amount:'9007199254740993.01'},{name:'一',amount:'0.01'},{name:'二',amount:'0.02'},{name:'三',amount:'0.03'},{name:'四',amount:'0.04'}]
 const dist=dashboard.distribution(rows,'9007199254740993.11');assert.equal(dist.rows.length,4);assert.equal(dist.rows[3].name,'其余分类');assert.equal(dist.rows[3].amountText,'0.03');assert.equal(dist.rows[0].amountText,'9,007,199,254,740,993.01');assert.ok(dist.rows.every(r=>Number.isFinite(r.percent)))
 assert.equal(dashboard.presentStats({...fixtures.zero,net_cost_total:'-500.00'}).netText,'-500.00');assert.equal(dashboard.presentStats({...fixtures.zero,net_cost_total:'-0.00'}).netText,'0.00')
})
test('empty and old statistics never invent zero fields or category proportions',()=>{
 assert.equal(dashboard.presentStats(fixtures.zero).distribution.empty,true)
 const old={...fixtures.stats};delete old.fixed_expense_total;delete old.status_counts;delete old.categories
 const data=dashboard.presentStats(old);assert.equal(data.compatible,false);assert.equal(data.breakdown[2].available,false);assert.equal(data.breakdown[2].text,'暂不可用');assert.equal(data.states[0].text,'—');assert.equal(data.distribution.available,false)
 assert.match(dashboard.distribution([{name:'数码',amount:'1.00'}],'2.00').error,/不一致/);assert.throws(()=>dashboard.presentStats({}),/不完整/)
})
test('reminders prioritize idle and upcoming warranty, and keep real empty and malformed states',()=>{
 assert.deepEqual(dashboard.reminders(fixtures.insights).map(r=>r.kind),['manual_idle','warranty_due'])
 assert.deepEqual(dashboard.reminders({analysis_cards:[]}),[]);assert.throws(()=>dashboard.reminders({analysis_cards:[{}]}),/格式异常/)
})
test('item statistics load without ledger capability, with separate failures and retries',async()=>{
 const h=harness();try{
  const request=api.request;api.request=async path=>{if(path==='/stats')throw Error('stats offline');return request(path)}
  await h.p.load();assert.match(h.p.data.itemStatsError,/offline/);assert.equal(h.p.data.itemReminders.length,2);assert.equal(h.p.data.enabled,false)
  api.request=request;await h.p.loadItemStats();assert.equal(h.p.data.itemStats.netText,'17,279.90');assert.equal(h.calls.filter(x=>x==='/insights').length,1)
  assert.ok(h.calls.every(x=>x==='/stats'||x==='/insights'))
 }finally{h.restore()}
})
test('switching panes and changing accounts reject delayed item responses',async()=>{
 const h=harness();try{
  const request=api.request,waiting=[];api.request=path=>path==='/stats'||path==='/insights'?new Promise(resolve=>waiting.push({path,resolve})):request(path)
  const pending=h.p.load();h.p.switchView({currentTarget:{dataset:{key:'cash'}}});await tick()
  waiting.forEach(w=>w.resolve(w.path==='/stats'?fixtures.stats:fixtures.insights));await pending
  assert.equal(h.p.data.itemStats,null);assert.equal(h.p.data.itemReminders.length,0)
  h.p.setData({view:'items'});const obsolete=h.p.load();h.p.onHide();h.app.globalData.token='dashboard-B';h.p.onShow()
  waiting.slice(2).forEach(w=>w.resolve(w.path==='/stats'?fixtures.stats:fixtures.insights));await obsolete;await tick()
  assert.equal(h.p.data.itemStats,null);assert.equal(h.p.data.view,'cash')
 }finally{h.restore()}
})
test('pane scrolls and calendar selection survive switching; midnight updates the monthly entry',async()=>{
 const h=harness(),today=ledger.today;try{
  h.p.setData({month:'2025-02',selectedDate:'2025-02-12'});h.p._scroll=400;h.p._viewScroll.cash=120
  h.p.switchView({currentTarget:{dataset:{key:'cash'}}});await tick();await tick()
  assert.equal(h.scrolls.at(-1).scrollTop,120);assert.equal(h.p.data.selectedDate,'2025-02-12')
  h.p._scroll=200;h.p.switchView({currentTarget:{dataset:{key:'items'}}});await tick();await tick()
  assert.equal(h.scrolls.at(-1).scrollTop,400);assert.equal(h.p.data.month,'2025-02')
  ledger.today=()=> '2026-10-31';h.p.tickDay();ledger.today=()=> '2026-11-01';assert.equal(h.p.tickDay(),true);assert.equal(h.p.data.itemMonth,'2026-11')
 }finally{ledger.today=today;h.restore()}
})
test('item cost measurements reject stale callbacks after a pane switch',()=>{
 const h=harness();try{
  h.p.setData({itemStats:dashboard.presentStats(fixtures.stats)});let callback
  wx.createSelectorQuery=()=>({in(){return this},select(){return this},selectAll(){return this},boundingClientRect(){return this},exec(cb){callback=cb}})
  h.p.measure();h.p.setData({view:'cash'});callback([{width:300},{width:300},[{dataset:{field:'net',size:32},width:50}]])
  assert.equal(h.p.data.itemLayout.main,32);assert.equal(h.p.data.itemLayout.stacked,false)
 }finally{h.restore()}
})
test('analysis targeting locates the requested card and handles a changed reminder safely',()=>{
 const h=harness();try{
  let def,selected,callback;const file=require.resolve('../miniprogram/pages/insights/index')
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:d=>def=d,wx:global.wx,getApp:global.getApp})
  const p={...def,data:{...def.data,statsLoading:false,cardsLoading:false,monthlyLoading:false,cards:fixtures.insights.analysis_cards},setData(v){Object.assign(this.data,v)}}
  p.onLoad({kind:'warranty_due'});p._visible=true
  wx.createSelectorQuery=()=>({in(){return this},select(s){selected=s;return this},selectViewport(){return this},boundingClientRect(){return this},scrollOffset(){return this},exec(cb){callback=cb}})
  p.locateAnalysis();assert.equal(selected,'#analysis-card-2');callback([{top:300},{scrollTop:60}]);assert.equal(h.scrolls.at(-1).scrollTop,348)
  p.onLoad({kind:'manual_idle'});p.locateAnalysis();h.app.globalData.token='other';callback([{top:900},{scrollTop:0}]);assert.equal(h.scrolls.length,1)
  p.onLoad({kind:'gone'});p.locateAnalysis();assert.equal(p._anchorPending,false)
 }finally{h.restore()}
})
