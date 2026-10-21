const test=require('node:test'),assert=require('node:assert/strict')
const time=require('../miniprogram/pages/fixed-expenses/lib/expense-progress')
const service={kind:'subscription',status:'active',service_from:'2026-10-01',service_until:'2026-11-01',next_due_on:'2026-11-03'}
test('Beijing natural days cross UTC afternoon midnight and ignore device DST',()=>{
 assert.equal(time.today(Date.parse('2026-10-12T15:59:59Z')),'2026-10-12')
 assert.equal(time.today(Date.parse('2026-10-12T16:00:00Z')),'2026-10-13')
 assert.equal(time.days('2024-03-11','2024-03-09'),2)
 assert.equal(time.untilMidnight(Date.parse('2026-10-12T15:59:59Z')),1100)
 assert.equal(time.days('2026-02-30','2026-02-01'),null)
})
test('remaining service fill shrinks while the payment date stays independent',()=>{
 const normal=time.present(service,'2026-10-12')
 assert.equal(normal.progress.value,'20 天');assert.equal(normal.dueText,'距付款还有 22 天')
 assert.equal(normal.progress.percent,20/31*100)
 assert.ok(time.progress(service,'2026-10-13').percent<normal.progress.percent)
 assert.equal(time.progress(service,'2026-10-26').urgent,true)
 assert.equal(time.progress(service,'2026-10-25').urgent,false)
 for(const [day,value] of [['2026-11-01','今天到期'],['2026-11-03','已过期 2 天']]){
  const p=time.progress(service,day);assert.equal(p.value,value);assert.equal(p.percent,0);assert.equal(p.urgent,true)
 }
})
test('future, incomplete and same-day validity never fabricate a ratio',()=>{
 assert.deepEqual({...time.progress(service,'2026-09-29'),caption:'',hint:''},{label:'尚未开始',value:'2 天后生效',percent:100,urgent:false,disabled:false,state:'',caption:'',hint:'',completed:false})
 const partial=time.progress({...service,service_from:null},'2026-10-12')
 assert.equal(partial.value,'20 天');assert.equal(partial.percent,null);assert.match(partial.hint,/补充开始日期/)
 const missing=time.progress({...service,service_until:null},'2026-10-12')
 assert.equal(missing.percent,null);assert.equal(missing.hint,'未设置服务到期日期')
 const same={...service,service_from:'2026-11-01'}
 assert.equal(time.progress(same,'2026-11-01').percent,0)
 assert.equal(time.progress(same,'2026-10-31').percent,100)
 assert.equal(time.progress({...service,service_from:'2026-11-03'},'2026-10-12').percent,null)
})
test('installment periods retain original month-end and leap-day anchors',()=>{
 assert.equal(time.monthOn('2026-01-31',1),'2026-02-28')
 assert.equal(time.monthOn('2026-01-31',2),'2026-03-31')
 assert.equal(time.monthOn('2024-02-29',12),'2025-02-28')
 assert.equal(time.monthOn('2026-01-31',-1),'2025-12-31')
 const row={kind:'installment',status:'active',anchor_on:'2026-01-31',next_cycle_index:2,next_due_on:'2026-03-31'}
 assert.equal(time.progress(row,'2026-03-01').percent,30/31*100)
 assert.equal(time.progress({...row,next_cycle_index:0,next_due_on:'2026-01-31'},'2026-01-01').percent,30/31*100)
 assert.equal(time.progress(row,'2026-02-01').percent,100)
 assert.equal(time.progress(row,'2026-04-01').value,'已逾期 1 天')
 assert.equal(time.progress({...row,completed:true},'2026-04-01').completed,true)
 assert.equal(time.progress({...row,completed:true},'2026-04-01').value,'本金已还清')
})
test('paused and ended periods keep true dates without suggesting a frozen subscription',()=>{
 for(const status of ['paused','ended']){
  const before=time.progress({...service,status},'2026-10-12'),after=time.progress({...service,status},'2026-10-13')
  assert.equal(before.disabled,true);assert.ok(after.percent<before.percent);assert.ok(before.state)
 }
})
