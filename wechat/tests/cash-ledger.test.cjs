const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module')
const api=require('../miniprogram/utils/api'),ledger=require('../miniprogram/utils/ledger')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function harness(name){
 const storage=new Map(),calls=[],modals=[],nav=[],app={globalData:{token:'alice',user:{id:1}},requireSession:()=>true},old=api.request
 global.getApp=()=>app
 global.wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,structuredClone(v)),removeStorageSync:k=>storage.delete(k),showModal:o=>{modals.push(o);o.success({confirm:true})},enableAlertBeforeUnload(){},disableAlertBeforeUnload(){},showToast(){},navigateBack:()=>nav.push('back'),redirectTo:o=>nav.push(o.url),switchTab:o=>nav.push(o.url)}
 api.request=(url,options={})=>{calls.push({url,options});return Promise.resolve(url==='/auth/me'?{capabilities:{cash_ledger:1}}:url==='/ledger/settings'?{enabled:true}:url==='/items'?[]:{entries:[],summary:{expense:'0.00',income:'0.00',refund:'0.00',net:'0.00'},next_offset:null,total:0})}
 const file=path.resolve(__dirname,'../miniprogram/pages/'+name+'/index.js');let definition
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),Page:v=>definition=v,getApp:global.getApp,wx:global.wx})
 const page={...definition,data:structuredClone(definition.data),setData(patch){for(const[k,v]of Object.entries(patch)){const bits=k.split('.');let target=this.data;for(const b of bits.slice(0,-1))target=target[b]||(target[b]={});target[bits.at(-1)]=v}}}
 return {page,storage,calls,modals,nav,app,restore(){page._alive=false;api.request=old;clearInterval(page._clock)}}
}
test('decimal cents are exact, bounded and do not accept float or scientific inputs',()=>{
 assert.equal(ledger.cents('0001.01'),101);assert.equal(ledger.cents('999999999.00'),99999999900)
 for(const value of ['0','-1','1.001','1e2','1000000000','NaN'])assert.throws(()=>ledger.cents(value))
 assert.equal(ledger.money('12345678901234567890.01'),'12,345,678,901,234,567,890.01')
 const native=Date.now;try{Date.now=()=>Date.parse('2026-10-12T16:00:00Z');assert.equal(ledger.today(),'2026-10-13')}finally{Date.now=native}
})
test('record opens actual categories, validates locally and preserves failed form',async()=>{
 const h=harness('ledger-record');try{h.page.onLoad({});await tick();assert.equal(h.page.data.ready,true);assert.equal(h.page.data.form.kind,'expense');assert.equal(h.page.data.categories.length,8)
 h.page.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'0'}});await h.page.save();assert.match(h.page.data.error,/大于零/);assert.equal(h.page.data.pending,false);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0)
 h.page.kind({currentTarget:{dataset:{key:'income'}}});assert.equal(h.page.data.categories.length,8)
 }finally{h.restore()}
})
test('unknown create result locks original fields, resumes without discard and verifies same operation',async()=>{
 const h=harness('ledger-record');try{h.page.onLoad({});await tick();h.page.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'28.01'}})
 const original=api.request;api.request=async(url,o)=>{if(o?.method==='POST')throw Error('timeout');return original(url,o)}
 await h.page.save();assert.equal(h.page.data.pending,true);const operation=h.page._operation,key=h.page._draftKey,draft=h.storage.get(key);assert.equal(draft.uncertain.data.amount,'28.01')
 h.page.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'99'}});assert.equal(h.page.data.form.amount,'28.01')
 h.page._ready=false;h.page._uncertain=null;h.page.setData({pending:false});await h.page.load();assert.equal(h.page.data.pending,true);assert.equal(h.modals.length,0);assert.equal(h.page._operation,operation)
 api.request=async url=>{assert.equal(url,'/ledger/operations/'+operation);return{id:'a'.repeat(32)}};await h.page.verify();assert.equal(h.storage.has(key),false);assert.deepEqual(h.nav,['back'])
 }finally{h.restore()}
})
test('version conflict keeps editable form and checks latest before retry',async()=>{
 const h=harness('ledger-record');try{const saved={id:'a'.repeat(32),kind:'expense',category:'food',amount:'40.00',occurred_on:'2026-10-01',name:'午餐',notes:'',item_id:null,state:'active',editable:true,revision:2}
 const original=api.request;api.request=(u,o)=>u.endsWith(saved.id)?Promise.resolve(saved):original(u,o);h.page.onLoad({id:saved.id});await tick();h.page.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'41.00'}})
 api.request=async()=>{throw Object.assign(Error('conflict'),{status:409})};await h.page.save();assert.equal(h.page.data.conflict,true);assert.equal(h.page.data.pending,false);assert.equal(h.page.data.form.amount,'41.00')
 api.request=async()=>({...saved,revision:3});await h.page.review();assert.equal(h.page._revision,3);assert.equal(h.page.data.form.amount,'41.00');assert.equal(h.page.data.conflict,false)
 }finally{h.restore()}
})
test('account change clears draft form and rejects old async results',async()=>{
 const h=harness('ledger-record');try{let resolve;api.request=()=>new Promise(r=>resolve=r);h.page.onLoad({});h.app.globalData.token='bob';h.page.onShow();resolve({capabilities:{cash_ledger:1}});await tick();assert.equal(h.page.data.enabled,false);assert.equal(h.page.data.form.amount,'');assert.match(h.page.data.error,/账户已切换/);assert.equal(h.storage.size,0)}finally{h.restore()}
})
test('old backend never receives ledger writes or silently enables form',async()=>{
 const h=harness('ledger-record');try{api.request=async url=>{h.calls.push({url});return{capabilities:{}}};h.page.onLoad({});await tick();await h.page.enable();await h.page.save();assert.equal(h.page.data.supported,false);assert.deepEqual(h.calls.map(c=>c.url),['/auth/me'])}finally{h.restore()}
})
test('history requires purchase confirmation and persists original batch on timeout',async()=>{
 const h=harness('ledger-history');try{api.request=async(u,o)=>{if(o?.method==='POST')throw Error('timeout');return{entries:[{source:'purchase',source_id:1,name:'相机',amount:'399.00',occurred_on:'2026-10-01',fingerprint:'version1'}],total:1,next_offset:null}}
 h.page.onLoad();await tick();h.page.check({currentTarget:{dataset:{key:'purchase:1'}}});assert.equal(h.page.data.selectedCount,0)
 h.page.mode({currentTarget:{dataset:{key:'purchase:1',mode:'installment'}}});assert.equal(h.page.data.rows[0].paidAmount,'0.00');await h.page.submit();assert.equal(h.page.data.pending,true);assert.equal(h.storage.get(h.page._draftKey).pending.entries[0].payment_info.mode,'installment')
 const pending=h.page._pending;api.request=async(u,o)=>{assert.deepEqual(o.data,pending);return{count:1}};h.page.load=async()=>{};await h.page.submit();assert.equal(h.page.data.pending,false);assert.equal(h.storage.size,0)
 }finally{h.restore()}
})
test('history local batch limit does not lock selections or make requests',async()=>{
 const h=harness('ledger-history');try{h.page._alive=true;h.page._visible=true;h.page._token='alice';h.page.setData({selectedCount:21,loading:false,rows:Array.from({length:21},(_,i)=>({source:'maintenance',source_id:i,checked:true}))});await h.page.submit();assert.equal(h.page.data.pending,false);assert.equal(h.calls.length,0);assert.match(h.page.data.error,/20条/)}finally{h.restore()}
})
test('hidden paginated response cannot reset a newer account or month loading',async()=>{
 const h=harness('ledger');try{h.page._alive=true;h.page._visible=true;h.page._token='alice';h.page._sequence=1;h.page.setData({enabled:true,nextOffset:30});let resolve;api.request=()=>new Promise(r=>resolve=r);const more=h.page.more();h.page._sequence=2;h.page.setData({loading:true,month:'2026-09'});resolve({entries:[],summary:{},filtered_summary:{},next_offset:null});await more;assert.equal(h.page.data.loading,true);assert.equal(h.page.data.month,'2026-09')}finally{h.restore()}
})
test('returning from background makes an unresolved submission verifiable without losing its identity',async()=>{
 const h=harness('ledger-record');try{h.page.onLoad({});await tick();h.page.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'25.00'}});let resolve;api.request=()=>new Promise(r=>resolve=r);const saving=h.page.save(),op=h.page._operation;h.page.onHide();resolve({id:'a'.repeat(32)});await saving;assert.equal(h.nav.length,0);h.page.onShow();assert.equal(h.page.data.busy,false);assert.equal(h.page.data.pending,true);assert.equal(h.page._operation,op);assert.equal(h.storage.get(h.page._draftKey).uncertain.data.amount,'25.00')}finally{h.restore()}
})
test('edit result verification accepts normalized cents, default name and trimmed notes',async()=>{
 const h=harness('ledger-record');try{h.page._alive=true;h.page._visible=true;h.page._token='alice';h.page._id='a'.repeat(32);h.page._draftKey='verify-draft';h.page._uncertain={data:{amount:'28',kind:'expense',category:'food',occurred_on:'2026-10-13',name:'',notes:' 午餐 ',item_id:null}};h.page.setData({pending:true});api.request=async()=>({id:h.page._id,amount:'28.00',kind:'expense',category:'food',occurred_on:'2026-10-13',name:'餐饮',notes:'午餐',item_id:null});await h.page.verify();assert.deepEqual(h.nav,['back']);assert.equal(h.page._uncertain,null)}finally{h.restore()}
})

test('linked payment delete confirms reversal, uses revision and cannot double-submit',async()=>{
 const h=harness('ledger-detail');try{
  h.page.onLoad({id:'a'.repeat(32)});h.page._visible=true
  const row={source:'installment',state:'active',deletable:true,editable:false,revision:7,refunds:[]}
  h.page.setData({row});let finish
  api.request=async(u,o)=>{h.calls.push({url:u,options:o});if(o?.method==='DELETE')return new Promise(r=>finish=r);return {...row,state:'void',amount:'35.00',refunds:[]}}
  const first=h.page.void();await tick();await h.page.void();assert.equal(h.calls.length,1)
  assert.equal(h.calls[0].options.revision,7);assert.match(h.modals[0].content,/计划和其他付款保留/)
  finish({});await first;assert.equal(h.page.data.row.state,'void');assert.equal(h.page.data.busy,false)
 }finally{h.restore()}
})
test('old backend retains source-only operation; refunds and account changes block linked deletion',async()=>{
 const h=harness('ledger-detail');try{
  h.page.onLoad({id:'a'.repeat(32)});h.page._visible=true
  const row={source:'subscription',state:'active',editable:false,revision:0,refunds:[]}
  h.page.setData({row});await h.page.void();assert.equal(h.calls.length,0)
  h.page.setData({row:{...row,deletable:true,refunds:[{state:'active'}]}});await h.page.void();assert.equal(h.calls.length,0);assert.match(h.page.data.error,/退款/)
  h.page.setData({row:{...row,deletable:true}});global.wx.showModal=o=>{h.app.globalData.token='bob';o.success({confirm:true})}
  // The page's VM has the original wx object, so mutate it rather than replace the object.
  await h.page.void();assert.equal(h.calls.length,0)
 }finally{h.restore()}
})

test('ledger recheck failure retains the last known entry and offers retry without falsifying its state',async()=>{
 const h=harness('ledger-detail');try{h.page.onLoad({id:'a'.repeat(32)});h.page._visible=true;const row={id:'a'.repeat(32),source:'installment',state:'void',deletable:false,editable:false};h.page.setData({row});api.request=async()=>{throw Error('offline')};await h.page.load();assert.equal(h.page.data.row.state,'void');assert.equal(h.page.data.loading,false);assert.equal(h.page.data.error,'offline')}finally{h.restore()}
})


test('free and expired accounts preserve selected book when saving a new entry',async()=>{
 const member=require('../miniprogram/utils/member');
 for(const status of ['free','expired']){
  const h=harness('ledger-record');member.reset();
  try{
   const original=api.request;api.request=(url,options={})=>url.startsWith('/membership')?Promise.resolve({active:false,status,entitlements:[],free_entitlements:['books','budgets'],plans:[],appearance:{effective:{theme:'default',template:'default'}}}):original(url,options);
   h.page.onLoad({book_id:'travel'});await tick();h.page.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'28'}});await h.page.save();
   assert.equal(h.calls.find(c=>c.options.method==='POST').options.data.book_id,'travel');assert.equal(h.page._newBook,'travel')
  }finally{member.reset();h.restore()}
 }
})

test('legacy backend does not silently move a selected-book draft to default',async()=>{
 const member=require('../miniprogram/utils/member'),h=harness('ledger-record');member.reset();
 try{
  const original=api.request;api.request=(url,options={})=>url.startsWith('/membership')?Promise.resolve({active:false,entitlements:[],plans:[],appearance:{effective:{theme:'default',template:'default'}}}):original(url,options);
  h.page.onLoad({book_id:'travel'});await tick();h.page.change({currentTarget:{dataset:{key:'amount'}},detail:{value:'28'}});await h.page.save();
  assert.match(h.page.data.error,/更新服务端/);assert.equal(h.page._newBook,'travel');assert.equal(h.page.data.form.amount,'28');assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0)
 }finally{member.reset();h.restore()}
})
