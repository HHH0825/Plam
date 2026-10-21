const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const {readCards,readStats}=require('../miniprogram/utils/discovery')
const source=require.resolve('../miniprogram/pages/insights/index.js')
const row=(kind,ids=[1])=>({kind,label:'记录提醒',headline:'留意这份记录',explanation:'完整依据',items:ids.map(id=>({id,name:'物品'+id,icon_type:'digital'}))})
const stats={total_items:5,net_cost_total:'-10.00',purchase_total:'20.00',maintenance_total:'0.00',disposal_total:'30.00'}
function harness(options={}){
 const app={globalData:{token:'discovery-A',user:{id:1}},requireSession:()=>true},calls=[],cached=[],scroll=[]
 const request=path=>new Promise((resolve,reject)=>calls.push({path,resolve,reject}));let definition
 const real=createRequire(source),wx={nextTick:f=>f(),pageScrollTo:r=>scroll.push(r),showToast(){},stopPullDownRefresh(){}}
 global.getApp=()=>app;global.wx=wx
 const display={present(p,v,done){p.setData(v,done)},read:p=>{cached.push(p);return request(p)},clear(){cached.push('clear')}}
 vm.runInNewContext(fs.readFileSync(source,'utf8'),{require:n=>n.endsWith('/member')?{wrap:d=>d}:n.endsWith('/api')?{request}:n.endsWith('/display-cache')?display:real(n),Page:d=>definition=d,getApp:()=>app,wx})
 const page={...definition,data:structuredClone(definition.data),setData(patch,done){for(const[k,v]of Object.entries(patch)){const parts=k.replace(/\[(\d+)\]/g,'.$1').split('.');let target=this.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=v}done?.()}}
 page.onLoad(options);page._visible=true
 return {page,app,calls,cached,wx,scroll,reply(i,data){calls[i].resolve(data)}}
}
test('discoveries prioritize actionable reminders, preserve same-kind order and use packaged hand-drawn art',()=>{
 const cards=readCards({analysis_cards:['digital_share','unknown_use','inactive','warranty_expired','purchase_yoy','warranty_due','manual_idle','repair_leader','inactive'].map((k,i)=>row(k,[i+1]))})
 assert.deepEqual(cards.map(c=>c.kind),['warranty_due','manual_idle','inactive','inactive','warranty_expired','unknown_use','repair_leader','purchase_yoy','digital_share'])
 assert.equal(cards[2].items[0].id,3);assert.equal(cards[3].items[0].id,9)
 assert.equal(new Set(cards.map(c=>c.key)).size,9)
 for(const c of cards){assert.ok(fs.existsSync('wechat/miniprogram'+c.art));assert.equal(c.items[0].art,'/assets/white-doodle/type-digital.png');assert.equal(c.basisOpen,false)}
})
test('overview never substitutes missing or malformed optional amounts with zero',()=>{
 for(const value of [undefined,null,'oops',0]){const r=readStats({...stats,fixed_expense_total:value});assert.equal(r.breakdown[2].text,'暂不可用')}
 assert.equal(readStats({...stats,fixed_expense_total:'0.00'}).breakdown[2].text,'¥0.00');assert.equal(readStats(stats).net_cost_total,'-10.00')
})
test('card folding, full item lists and refreshed results preserve explicit choices',async()=>{
 const h=harness(),p=h.page,read=p.loadCards();h.reply(0,{analysis_cards:[row('manual_idle',[1,2,3,4,5])]});await read
 assert.equal(p.data.cards[0].shownItems.length,3)
 const click=field=>p.toggleCard({currentTarget:{dataset:{index:0,field}}})
 click('basisOpen');click('itemsOpen');assert.equal(p.data.cards[0].basisOpen,true);assert.equal(p.data.cards[0].shownItems.length,5)
 const next=p.loadCards();h.reply(1,{analysis_cards:[row('manual_idle',[1,2,3,4,5])]});await next
 assert.equal(p.data.cards[0].basisOpen,true);assert.equal(p.data.cards[0].itemsOpen,true)
 click('itemsOpen');assert.equal(p.data.cards[0].shownItems.length,3);click('__proto__');assert.equal(p.data.cards[0].basisOpen,true)
 p.toggleDetails();p.toggleTrend();p.onHide();assert.equal(p.data.detailsOpen,true);assert.equal(p.data.trendOpen,true)
})
test('refresh failure keeps valid discoveries and amount data visible with retry state',async()=>{
 const h=harness(),p=h.page,initial=p.load();h.reply(0,stats);h.reply(1,{analysis_cards:[row('manual_idle')]});await initial
 const before=JSON.stringify([p.data.stats,p.data.cards]),refresh=p.load();assert.equal(JSON.stringify([p.data.stats,p.data.cards]),before)
 h.calls[2].reject(Error('离线'));h.calls[3].reject(Error('离线'));await refresh
 assert.equal(JSON.stringify([p.data.stats,p.data.cards]),before);assert.equal(p.data.cardsError,'离线');assert.equal(p.data.cardsLoading,false)
})
test('show reuses display reads; retries are direct; account changes reset all choices before responses',async()=>{
 const h=harness(),p=h.page;p.onShow();assert.deepEqual(h.cached,['/stats','/insights']);assert.equal(h.calls[2].path,'/reports/monthly')
 h.reply(0,stats);h.reply(1,{analysis_cards:[row('manual_idle')]});await new Promise(r=>setImmediate(r));p.toggleDetails();p.onHide()
 h.app.globalData.token='discovery-B';h.app.globalData.user.id=2;p.onShow();assert.equal(p.data.stats,null);assert.equal(p.data.cards.length,0);assert.equal(p.data.detailsOpen,false)
 h.reply(2,{});await new Promise(r=>setImmediate(r));assert.equal(p.data.monthly,null)
 const direct=p.loadStats();assert.equal(h.cached.length,4);h.reply(6,stats);await direct;assert.equal(p.data.stats.total_items,5)
})
test('target reminder is located before overview and month responses; obsolete account cannot scroll',async()=>{
 const h=harness({kind:'warranty_due'}),p=h.page;let selected,callback
 h.wx.createSelectorQuery=()=>({in(){return this},select(s){selected=s;return this},selectViewport(){return this},boundingClientRect(){return this},scrollOffset(){return this},exec(fn){callback=fn}})
 const load=p.loadCards();h.reply(0,{analysis_cards:[row('digital_share'),row('warranty_due')]});await load
 assert.equal(p.data.monthlyLoading,true);assert.equal(selected,'#analysis-card-0');callback([{top:320},{scrollTop:50}]);assert.equal(h.scroll[0].scrollTop,358)
 p._anchorPending=true;p.locateAnalysis();h.app.globalData.token='different';callback([{top:500},{scrollTop:0}]);assert.equal(h.scroll.length,1)
})
test('Me discovery entry is removed and statistics entry remains',()=>{
 assert.doesNotMatch(fs.readFileSync('wechat/miniprogram/pages/me/index.wxml','utf8'),/menu-discover|bindtap="insights"/)
 assert.doesNotMatch(fs.readFileSync('wechat/miniprogram/pages/me/index.js','utf8'),/insights\(\)/)
 assert.match(fs.readFileSync('wechat/miniprogram/templates/item-dashboard.wxml','utf8'),/bindtap="itemAnalysis"/)
})
