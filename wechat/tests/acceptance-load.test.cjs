const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname, '../deploy/cloudbase/qa-controlled-load.js'), 'utf8')
const tick = () => new Promise(resolve => setImmediate(resolve))
const approved = {free_quota_verified:true,cos_attribution_verified:true,existing_cls_logs_verified:true,
  current_qps_limit_verified:true,paid_overflow_disabled_verified:true,qps:1,calls_remaining:2000,
  round:'20261007',test_items:Array.from({length:10},(_,i)=>100+i)}
function harness(storage = new Map()) {
  const app={globalData:{token:'private-session',user:{id:1}}}, calls=[], items=new Map(approved.test_items.map(id=>[id,{id,name:'qa-20261007-'+id,revision:0,is_pinned:false}]))
  let now=0
  class Clock extends Date {static now(){return now}}
  const api={request:async(path,options={})=>{
    calls.push({path,options,time:now})
    const id=Number(path.split('/')[2]), row=items.get(id)
    if(options.method==='PUT'){
      assert.equal(options.revision,row.revision)
      row.revision++;row.is_pinned=options.data.is_pinned
    }
    return row ? {...row} : []
  }}
  const wx={getStorageSync:k=>storage.has(k)?JSON.parse(storage.get(k)):undefined,setStorageSync:(k,v)=>storage.set(k,JSON.stringify(v))}
  const execute=vm.runInNewContext('('+source+')',{getApp:()=>app,require:()=>api,wx,Date:Clock,Number,Promise,Array,Set,Math,Error,String,setTimeout:fn=>setImmediate(fn)})
  return {app,api,items,calls,execute,storage,advance:ms=>now+=ms}
}
async function finish(h){for(let n=0;n<3000&&h.app._stabilityRunning;n++){h.advance(1000);await tick()}}
test('missing evidence, cleanup reserve, or test manifest never sends a request',()=>{
  for(const key of Object.keys(approved).filter(k=>k.endsWith('_verified'))){
    const h=harness();assert.equal(h.execute({...approved,[key]:false}).blocked,true);assert.equal(h.calls.length,0)
  }
  for(const change of [{test_items:[]},{test_items:Array(10).fill(1)},{calls_remaining:709},{calls_remaining:2001}]) assert.equal(harness().execute({...approved,...change}).blocked,true)
})
test('native stages count 50 reads and 25 guarded writes each, reserve budget across windows',async()=>{
  const h=harness(), result=h.execute(approved);assert.equal(result.planned_business_calls,310)
  await finish(h)
  const state=h.app._stability
  assert.equal(state.phase,'complete');assert.equal(state.sent,310);assert.equal(state.completed,310)
  assert.equal(state.errors,0);assert.equal(state.final_failures,0)
  assert.doesNotMatch(JSON.stringify(state),/private-session/)
  for(const clients of [1,2,5,10]){
    assert.equal(state.samples.filter(s=>s.clients===clients&&s.kind==='read').length,50)
    assert.equal(state.samples.filter(s=>s.clients===clients&&s.kind==='write').length,25)
  }
  for(let i=1;i<h.calls.length;i++)assert.ok(h.calls[i].time-h.calls[i-1].time>=1000)
  assert.equal(JSON.parse(h.storage.get('palmAcceptanceBudget:20261007')).calls,310)
  h.execute(approved);await finish(h)
  assert.equal(JSON.parse(h.storage.get('palmAcceptanceBudget:20261007')).calls,620)
})
test('account changes, expired windows, stop, foreign test item and exhausted ledger fail closed',async()=>{
  for(const mode of ['account','window','stop']){
    const h=harness();h.execute(approved);assert.equal(h.execute(approved).blocked,true)
    if(mode==='account')h.app.globalData.token='new-account'
    if(mode==='window')h.advance(3600001)
    if(mode==='stop')h.app._stabilityStop()
    await finish(h);assert.equal(h.calls.length,0);assert.equal(h.app._stability.phase,'stopped')
  }
  const h=harness();h.items.get(100).name='User preserved item';h.execute(approved);await finish(h)
  assert.equal(h.app._stability.phase,'stopped');assert.equal(h.calls.length,1)
  const storage=new Map([['palmAcceptanceBudget:20261007',JSON.stringify({calls:1400})]])
  assert.equal(harness(storage).execute(approved).blocked,true)
})
test('uncertain writes retry once using the same revision and request id',async()=>{
  const h=harness(), original=h.api.request, attempts=[];let failed=false
  h.api.request=async(path,options)=>{
    if(options.method==='PUT'&&!failed){failed=true;attempts.push({...options});throw Error('offline')}
    if(options.method==='PUT'&&attempts.length===1)attempts.push({...options})
    return original(path,options)
  }
  h.execute(approved);await finish(h)
  assert.equal(h.app._stability.phase,'complete');assert.equal(h.app._stability.sent,311)
  assert.equal(h.app._stability.retries,1);assert.deepEqual(attempts[0],attempts[1])
})
