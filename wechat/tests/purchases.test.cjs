const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm')
const tick = () => new Promise(resolve => setImmediate(resolve))
function runtime(name,extra={}) {
  const app = { globalData:{token:'alice',user:{id:1}},requireSession:()=>true }, storage=new Map(), calls=[], modals=[], navigation=[]
  let responder=()=>Promise.resolve([]), definition
  const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,structuredClone(v)),removeStorageSync:k=>storage.delete(k),showToast(){},showModal:o=>modals.push(o)}
  const api={request:(path,options={})=>{calls.push({path,options});return responder(path,options)},photoCache:()=>({release(){},load:async()=>'/photo'})}
  const requires={'./lib/form':require('../miniprogram/pages/fixed-expenses/lib/form'),'./lib/expense-progress':require('../miniprogram/pages/fixed-expenses/lib/expense-progress'),'./api':api,'./view':{today:()=> '2026-10-10',errorMessage:e=>e.message,decorate:r=>r},'./cloud-transport':{serviceScope:()=> 'test'},'./navigation':{navigate:(_,url)=>navigation.push(url),resetNavigation(){}}}
  const module={exports:{}}
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/purchase-ui'),'utf8'),{module,require:n=>requires[n],wx,getApp:()=>app})
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/'+name+'/index'),'utf8'),{Page:p=>definition=p,require:n=>n.endsWith('/member')?require('./member-stub.cjs'):n.endsWith('purchase-ui')?module.exports:requires[n.replace('../../utils/','./')],wx,getApp:()=>app,...extra})
  const page={...definition,data:structuredClone(definition.data),setData(patch){for(const[k,v]of Object.entries(patch)){const parts=k.split('.');let row=this.data;while(parts.length>1){const p=parts.shift();row=row[p]||(row[p]={})}row[parts[0]]=v}}}
  page.onLoad({});page._visible=true
  return {page,app,storage,calls,modals,navigation,respond(fn){responder=fn}}
}
const event=(field,value)=>({currentTarget:{dataset:{field}},detail:{value}})
const wish={id:4,name:'耳机',status:'considering',revision:0,reason:'降噪',expected_price:'100.00',category:'数码',review_on:null,similar_items:[]}
const expense={id:5,name:'会员',kind:'subscription',status:'active',revision:0,amount:'10.00',anchor_on:'2026-10-10',cycle:'month',next_cycle_index:0,next_due_on:'2026-10-10',due_days:0,remaining_days:3,service_until:'2026-10-13',suggested_principal:'0.00',item_id:1,item_name:'电脑',payments:[]}
test('midnight presentation refresh preserves payment input and cancels timers on hide or account switch',()=>{
  let callback,cleared=[]
  const h=runtime('fixed-expenses',{setTimeout(fn){callback=fn;return 7},clearTimeout(id){cleared.push(id)}})
  h.page.setData({rows:[expense],selected:expense,payment:{amount:'88.00'},paying:true})
  h.page.scheduleMidnight();assert.equal(typeof callback,'function')
  callback();assert.equal(h.page.data.payment.amount,'88.00');assert.equal(h.page.data.paying,true)
  assert.ok(h.page.data.rows[0].progress);assert.ok(h.page.data.selected.progress);assert.equal(h.calls.length,0)
  h.page.onHide();assert.ok(cleared.includes(7))
  h.page._visible=true;h.page.scheduleMidnight();const stale=callback
  h.app.globalData.token='bob';h.page.onShow();assert.equal(h.page._midnightTimer,null)
  stale();assert.equal(h.page.data.rows.length,0);assert.equal(h.page.data.selected,null)
})
test('renewal, plan edit and void re-present the returned dates without changing ledger amounts',async()=>{
  const time=require('../miniprogram/pages/fixed-expenses/lib/expense-progress'),today=time.today()
  const shift=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
  const h=runtime('fixed-expenses')
  let latest={...expense,service_from:shift(-10),service_until:shift(1),next_due_on:shift(1),payments:[]}
  h.page.setData({selected:latest,listReady:true,itemsReady:true})
  h.respond((path,options)=>Promise.resolve(options.method==='POST'||options.method==='DELETE'?{}:latest))
  h.page.beginPay();h.page.paymentField(event('amount','19.90'))
  latest={...latest,revision:1,service_until:shift(30)}
  await h.page.savePayment()
  assert.equal(h.page.data.selected.progress.value,'30 天')
  assert.equal(h.calls.find(c=>c.options.method==='POST').options.data.amount,'19.90')
  h.page.edit();h.page.field(event('service_until',shift(40)));latest={...latest,revision:2,service_until:shift(40)}
  await h.page.save();assert.equal(h.page.data.selected.progress.value,'40 天')
  latest={...latest,revision:3,service_until:shift(-2)}
  const pending=h.page.voidPayment({currentTarget:{dataset:{id:9}}})
  h.modals.at(-1).success({confirm:true});await pending
  assert.equal(h.page.data.selected.progress.value,'已过期 2 天');assert.equal(h.page.data.selected.progress.percent,0)
  assert.ok(h.calls.some(c=>c.options.method==='DELETE'&&c.path.endsWith('/payments/9')))
})
test('wish draft has no default deadline and is isolated from another account',()=>{
  const h=runtime('wishlist');h.page.add();assert.equal(h.page.data.form.review_on,'')
  h.page.field(event('name','私人心愿'));assert.equal(h.storage.size,1)
  h.app.globalData.token='bob';h.app.globalData.user={id:2}
  h.page.field(event('name','旧输入'));assert.equal(h.storage.size,1)
  h.page.onShow();assert.equal(h.page.data.form.name,undefined);assert.equal(h.page.data.shown.length,0)
  assert.equal(h.page.current(),false)
})
test('similarity is shown before converting; cancelling never posts a conversion',async()=>{
  const h=runtime('wishlist');h.page.setData({selected:wish,editing:true});h.respond(async()=>({...wish,similar_items:[{id:1,name:'已有耳机',match_reason:'名称相近'}]}))
  const action=h.page.convert();await tick();assert.equal(h.page.data.similar[0].name,'已有耳机')
  h.modals[0].success({confirm:false});await action
  assert.equal(h.navigation.length,0);assert.ok(h.calls.every(c=>!c.options.method))
  const next=h.page.convert();await tick();h.app.globalData.token='bob';h.modals[1].success({confirm:true});await next
  assert.equal(h.navigation.length,0)
})
test('opening a payment is read-only and explicit submission blocks duplicate clicks',async()=>{
  const h=runtime('fixed-expenses');h.page.setData({selected:expense,listReady:true});h.page.beginPay();assert.equal(h.calls.length,0)
  h.page.cancelPay();assert.equal(h.calls.length,0);h.page.beginPay()
  let finish;h.respond(path=>path.endsWith('/payments')?new Promise(r=>finish=r):Promise.resolve({...expense,revision:1,payments:[{id:1}]}))
  const pending=h.page.savePayment();await h.page.savePayment();assert.equal(h.calls.length,1)
  assert.equal(h.calls[0].options.data.cycle_index,0);assert.equal(h.calls[0].options.revision,0)
  finish({id:1});await pending;assert.equal(h.page.data.paying,false);assert.equal(h.page.data.selected.revision,1)
})
test('an explicitly unlinked historical payment stays unlinked when the current plan has a device',()=>{
  const h=runtime('fixed-expenses');h.page.setData({listReady:true,itemsReady:true,selected:{...expense,payments:[{id:9,item_id:null,amount:'10.00'}]},items:[{id:1,name:'电脑'}],itemNames:['不关联物品','电脑']})
  h.page.beginPay({currentTarget:{dataset:{id:9}}});assert.equal(h.page.data.paymentItemIndex,0);assert.equal(h.page.data.paymentLinkText,'不关联物品');assert.equal(h.page.data.payment.item_id,null)
})
test('payment conflicts keep actual amounts and old account responses cannot restore details',async()=>{
  const h=runtime('fixed-expenses');h.page.setData({selected:expense,listReady:true});h.page.beginPay();h.page.paymentField(event('amount','19.90'))
  h.respond(async()=>{throw Object.assign(Error('版本变化'),{status:409})});await h.page.savePayment()
  assert.equal(h.page.data.payment.amount,'19.90');assert.equal(h.page.data.conflict,true)
  let finish;h.respond(()=>new Promise(r=>finish=r));const read=h.page.open({currentTarget:{dataset:{id:5}}})
  h.app.globalData.token='bob';h.app.globalData.user={id:2};h.page.onShow();finish(expense);await read
  assert.equal(h.page.data.selected,null);assert.equal(h.page.data.payment.amount,undefined)
})
test('all WXML templates have matching tags and conditions use native expressions',()=>{
  const path=require('node:path'),root=path.resolve(__dirname,'../miniprogram')
  function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(file.endsWith('.wxml')){
    const text=fs.readFileSync(file,'utf8'),stack=[]
    for(const token of text.matchAll(/<\/?([\w-]+)(?:"[^"]*"|'[^']*'|[^'">])*\/?\s*>/g)){
      if(token[0].startsWith('</'))assert.equal(stack.pop(),token[1],file+' '+token[0])
      else if(!/\/\s*>$/.test(token[0]))stack.push(token[1])
    }
    assert.equal(stack.length,0,file+' unclosed '+stack.join(','));assert.ok(!text.includes('&amp;&amp;'),file)
  }}}visit(root)
})

test('root 404 disables mutations, differs from empty success, and clears on recheck',async()=>{
  const h=runtime('fixed-expenses')
  h.respond(async path=>{if(path==='/items')return [];throw Object.assign(Error('记录不存在'),{status:404})})
  await h.page.load();assert.equal(h.page.data.featureUnavailable,true);assert.match(h.page.data.error,/功能暂不可用/);assert.doesNotMatch(h.page.data.error,/记录不存在/)
  const count=h.calls.length;h.page.add();h.page.setData({selected:expense});h.page.beginPay();await h.page.save();await h.page.savePayment()
  assert.equal(h.calls.length,count);assert.equal(h.page.data.editing,false);assert.equal(h.page.data.paying,false)
  h.page.setData({selected:null});h.respond(async path=>path==='/items'?[]:{plans:[],totals:{cents:'0.00'}})
  await h.page.load();assert.equal(h.page.data.featureUnavailable,false);assert.equal(h.page.data.error,'');assert.equal(h.page.data.listReady,true);assert.equal(h.page.data.shown.length,0)
  h.page.add();assert.equal(h.page.data.editing,true)
})

test('subscription rows display before a slow device read and survive a failed one',async()=>{
  const h=runtime('fixed-expenses');let rejectItems
  h.respond(path=>path==='/items'?new Promise((_,reject)=>rejectItems=reject):Promise.resolve({plans:[expense],totals:{cents:'10.00'}}))
  const pending=h.page.load();await tick()
  assert.equal(h.page.data.loading,false);assert.equal(h.page.data.shown.length,1);assert.equal(h.page.data.itemsReady,false)
  rejectItems(Error('网络错误'));await pending
  assert.equal(h.page.data.error,'');assert.equal(h.page.data.shown.length,1);assert.match(h.page.data.itemsError,/原关联保留/)
  h.page.setData({selected:expense});h.page.edit();assert.equal(h.page.data.form.item_id,1);assert.match(h.page.data.formLinkText,/电脑.*暂不能更换/)
  h.page.itemChange({detail:{value:0}});assert.equal(h.page.data.form.item_id,1)
  h.respond(async path=>path==='/items'?[{id:1,name:'电脑'}]:expense)
  await h.page.save();assert.equal(h.calls.find(c=>c.options.method==='PUT').options.data.item_id,1)
  h.page.beginPay();h.page.paymentItem({detail:{value:0}});assert.equal(Object.hasOwn(h.page.data.payment,'item_id'),false)
  assert.match(h.page.data.paymentLinkText,/保留原关联/)
  await h.page.retryItems();assert.equal(h.page.data.itemsReady,true);assert.equal(h.page.data.itemsError,'');assert.equal(h.page.data.paymentLinkText,'电脑')
})

test('detail 404 shows a return route and blocks stale payment actions',async()=>{
  const h=runtime('fixed-expenses');h.page.setData({listReady:true,loading:false,selected:expense})
  h.respond(async()=>{throw Object.assign(Error('记录不存在'),{status:404})})
  await h.page.open({currentTarget:{dataset:{id:5}}})
  assert.equal(h.page.data.detailMissing,true);assert.match(h.page.data.error,/已删除或无法访问/)
  const count=h.calls.length;h.page.beginPay();await h.page.savePayment();assert.equal(h.calls.length,count)
  h.respond(async path=>path==='/items'?[]:{plans:[],totals:null});await h.page.back()
  assert.equal(h.page.data.detailMissing,false);assert.equal(h.page.data.selected,null);assert.equal(h.page.data.error,'')
})

test('network errors hide stale rows; overlapping retries and account changes discard old reads',async()=>{
  const h=runtime('fixed-expenses');let finishOld,finishOldItems
  h.respond(path=>new Promise(resolve=>{if(path==='/items')finishOldItems=resolve;else finishOld=resolve}))
  const old=h.page.load();await tick()
  h.respond(async()=>{throw Error('网络暂不可用')});await h.page.load()
  assert.equal(h.page.data.featureUnavailable,false);assert.equal(h.page.data.listReady,false);assert.equal(h.page.data.shown.length,0);assert.equal(h.page.data.loading,false)
  finishOld({plans:[expense],totals:{cents:'10.00'}});finishOldItems([{id:1,name:'旧物品'}]);await old
  assert.equal(h.page.data.shown.length,0);assert.equal(h.page.data.items.length,0)
  let finish;h.respond(path=>path==='/items'?Promise.resolve([]):new Promise(resolve=>finish=resolve))
  const pending=h.page.load();h.app.globalData.token='bob';h.page.onShow();finish({plans:[expense],totals:{cents:'10.00'}});await pending
  assert.equal(h.page.data.rows.length,0);assert.equal(h.page.data.listReady,false)
})

const formUI=require('../miniprogram/pages/fixed-expenses/lib/form')
test('quick form uses exact cents, month anchors and a visible final principal remainder',()=>{
 assert.equal(formUI.cents('100.01'),10001);assert.equal(formUI.cents('1e2'),null)
 const f={name:'手机',kind:'installment',principal_total:'100.01',periods:3,amount:'0.00',anchor_on:'2025-01-31',cycle:'month'}
 assert.equal(formUI.principal(f),3333);assert.match(formUI.summary(f).detail,/33.35/)
 assert.equal(formUI.following(f),'2025-02-28')
 assert.equal(formUI.following({...f,kind:'subscription',anchor_on:'2024-02-29',cycle:'year'}),'2025-02-28')
 assert.equal(formUI.following({...f,kind:'subscription',anchor_on:'2025-12-31',cycle:'days',cycle_days:2}),'2026-01-02')
 assert.match(formUI.validate(f,{paid_on:'2099-01-01',amount:'0',principal:'33.33'},'2026-10-21'),/不能晚于/)
 assert.match(formUI.summary(f,{paid_on:'2025-01-30',amount:'1.50',principal:'33.33'}).note,/34.83/)
})
test('kind switching preserves separate costs and old installment fee means fee, never gross payment',()=>{
 const h=runtime('fixed-expenses');h.page.setData({listReady:true});h.page.showForm({name:'音乐',kind:'subscription',amount:'30',cycle:'month',anchor_on:'2026-10-21',periods:12})
 h.page.kindChange({currentTarget:{dataset:{index:1}}});assert.equal(h.page.data.form.amount,'0.00');assert.equal(h.page.data.hasFees,false)
 h.page.field(event('principal_total','6000'));h.page.toggleFees({detail:{value:true}});h.page.field(event('amount','2.50'))
 h.page.kindChange({currentTarget:{dataset:{index:0}}});assert.equal(h.page.data.form.amount,'30')
 h.page.kindChange({currentTarget:{dataset:{index:1}}});assert.equal(h.page.data.form.amount,'2.50');assert.equal(h.page.data.form.principal_total,'6000')
 h.page.showForm({...h.page.data.form,amount:'6.00'});assert.equal(h.page.data.hasFees,true);assert.match(h.page.data.formSummary.detail,/额外费用 6.00/)
})
test('first payment is opt-in, enabling requires explicit consent and capability failure stays distinct',async()=>{
 const h=runtime('fixed-expenses');h.page.setData({listReady:true});h.page.showForm({name:'音乐',kind:'subscription',amount:'30',cycle:'month',anchor_on:'2026-10-21'})
 h.respond(async p=>p==='/auth/me'?{capabilities:{fixed_expense_quick_add:1}}:{enabled:false});await h.page.loadQuickSupport()
 assert.equal(h.page.data.recordInitial,false);const action=h.page.toggleInitial({detail:{value:true}})
 h.modals.at(-1).success({confirm:false});await action;assert.equal(h.page.data.recordInitial,false)
 const yes=h.page.toggleInitial({detail:{value:true}});h.modals.at(-1).success({confirm:true});await yes
 assert.equal(h.page.data.initialConsent,true);assert.equal(h.page.data.initialForm.amount,'30')
 h.respond(async()=>{throw Error('offline')});await h.page.loadQuickSupport();assert.equal(h.page.data.quickState,'error')
 h.respond(async p=>p==='/auth/me'?{capabilities:{}}:{enabled:true});await h.page.loadQuickSupport();assert.equal(h.page.data.quickState,'unavailable')
})
test('plain old-server save never enables or posts a payment and double clicks send once',async()=>{
 const h=runtime('fixed-expenses');h.page.setData({listReady:true,quickState:'unavailable'});h.page.showForm({name:'音乐',kind:'subscription',amount:'30',cycle:'month',anchor_on:'2026-10-21'})
 let finish;h.respond((p,o)=>o.method==='POST'?new Promise(r=>finish=r):Promise.resolve(expense))
 const pending=h.page.save();await h.page.save();assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.data.initial_payment,undefined)
 finish(expense);await pending;assert.equal(h.page.data.editing,false);assert.equal(h.storage.size,0)
})
test('uncertain save freezes exact body and persistent request ID across leaving and restored draft',async()=>{
 const h=runtime('fixed-expenses');h.page.setData({listReady:true,quickState:'ready',ledgerEnabled:true});h.page.showForm({name:'音乐',kind:'subscription',amount:'30',cycle:'month',anchor_on:'2026-10-21'})
 await h.page.toggleInitial({detail:{value:true}});h.respond(async()=>{throw Error('timeout')});await h.page.save()
 const first=h.calls[0].options, draft=[...h.storage.values()][0];assert.ok(first.requestId);assert.ok(draft._submission)
 h.page.field(event('amount','99'));assert.equal(h.page.data.form.amount,'30')
 h.page.showForm(h.page.restoreForm({}));assert.equal(h.page.data.recordInitial,true);assert.equal(h.page.data.createPending,true)
 h.respond(async(p,o)=>o.method==='POST'?{...expense,initial_payment_created:true}:expense);await h.page.save()
 const second=h.calls.findLast(c=>c.options.method==='POST').options
 assert.equal(first.requestId,second.requestId);assert.equal(JSON.stringify(first.data),JSON.stringify(second.data));assert.equal(h.storage.size,0)
})
test('hidden create success preserves ID without reopening or overwriting another edit',async()=>{
 const h=runtime('fixed-expenses');h.page.setData({listReady:true});h.page.showForm({name:'音乐',kind:'subscription',amount:'30',cycle:'month',anchor_on:'2026-10-21'})
 let finish;h.respond(()=>new Promise(r=>finish=r));const pending=h.page.save();h.page.onHide()
 h.page.setData({form:{name:'另一条草稿'},editing:true,selected:{id:100}});finish(expense);await pending
 assert.equal(h.page.data.form.name,'另一条草稿');assert.equal(h.page.data.selected.id,100)
 const draft=[...h.storage.values()][0];assert.equal(draft._submission.savedId,5);assert.equal(draft.name,'音乐')
})
test('account switch ignores create completion and unavailable storage prevents sending',async()=>{
 const h=runtime('fixed-expenses');h.page.setData({listReady:true});h.page.showForm({name:'音乐',kind:'subscription',amount:'30',cycle:'month',anchor_on:'2026-10-21'})
 let finish;h.respond(()=>new Promise(r=>finish=r));const pending=h.page.save();h.app.globalData.token='bob';h.app.globalData.user={id:2};h.page.onShow();finish(expense);await pending
 assert.equal(h.page.data.selected,null);assert.equal([...h.storage.values()][0]._submission.savedId,undefined)
 const n=runtime('fixed-expenses');n.page.setData({listReady:true});n.page.showForm({name:'音乐',kind:'subscription',amount:'30',cycle:'month',anchor_on:'2026-10-21'})
 n.page.persistCreation=()=>{throw Error('full')};await n.page.save();assert.equal(n.calls.length,0);assert.match(n.page.data.error,/存储/)
})
test('editing next due date preserves schedule unless changed and survives draft restore',async()=>{
 const h=runtime('fixed-expenses'),row={...expense,anchor_on:'2026-01-31',next_due_on:'2026-10-31'}
 h.page.setData({selected:row,listReady:true});h.page.edit();assert.equal(h.page.data.form.anchor_on,'2026-10-31')
 h.respond(async(p,o)=>o.method==='PUT'?row:row);await h.page.save();assert.equal(h.calls[0].options.data.anchor_on,'2026-01-31')
 h.page.edit();h.page.field(event('anchor_on','2026-11-01'));h.page.edit();assert.equal(h.page.data.form.anchor_on,'2026-11-01')
 await h.page.save();assert.equal(h.calls.findLast(c=>c.options.method==='PUT').options.data.anchor_on,'2026-11-01')
})

test('returning to an existing plan rereads payments changed from the ledger page',async()=>{
 const h=runtime('fixed-expenses');h.page.setData({selected:expense,listReady:true});const changed={...expense,revision:3,paid_cost:'0.00',payments:[{id:9,voided:true}]}
 h.respond(async path=>path==='/items'?[]:path==='/fixed-expenses'?{plans:[changed],totals:{}}:changed)
 await h.page.load();assert.equal(h.page.data.selected.revision,3);assert.equal(h.page.data.selected.payments[0].voided,true)
})
test('a saved plan lacking first-payment confirmation is read by ID and never auto-paid again',async()=>{
 const h=runtime('fixed-expenses');h.page.setData({listReady:true,quickState:'ready',ledgerEnabled:true});h.page.showForm({name:'音乐',kind:'subscription',amount:'30',cycle:'month',anchor_on:'2026-10-21'})
 await h.page.toggleInitial({detail:{value:true}});h.respond(async()=>expense);await h.page.save()
 assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);assert.equal(h.calls[1].path,'/fixed-expenses/5');assert.match(h.page.data.error,/不会自动补记/)
 const paid={name:'手机',kind:'installment',principal_total:'100.01',periods:1,amount:'0',anchor_on:'2026-10-21'}
 assert.match(formUI.summary(paid,{amount:'0',principal:'100.01',paid_on:'2026-10-21'}).note,/已还清/)
})

test('subscription reduced-motion styles use WXSS-supported explicit selectors',()=>{
 const css=fs.readFileSync(require.resolve('../miniprogram/pages/fixed-expenses/index.wxss'),'utf8')
 assert.doesNotMatch(css,/\.expense-editor\s+\*/)
 assert.match(css,/@media\s*\(prefers-reduced-motion:reduce\)\s*\{\.expense-kind,\.expense-cycle,\.expense-more\{/)
})
