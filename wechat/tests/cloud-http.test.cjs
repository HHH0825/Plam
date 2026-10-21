const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')

test('daily visit and fixed achievement claims pass the HTTP allowlist with durable request IDs',async()=>{
 const h=harness()
 for(const route of ['/rewards/visit','/rewards/achievements/visits_3/claim','/rewards/achievements/items_100/claim']){
  const pending=h.transport.send(route,{method:'POST',data:{}},'a'.repeat(64)),i=h.calls.length-1
  assert.equal(h.calls[i].path,'/api/mp'+route);assert.ok(h.calls[i].header['Idempotency-Key']);h.respond(i,200,{balance:10});await pending
 }
 for(const route of ['/rewards/achievements/../claim','/rewards/achievements/items_100/grant'])await assert.rejects(h.transport.send(route,{method:'POST',data:{}},'a'.repeat(64)))
})
test('whole-list book ordering reaches the native HTTP function with its version precondition',async()=>{
 const h=harness(),pending=h.transport.send('/member/books/order',{method:'PUT',revision:3,data:{book_ids:['default','a'.repeat(32)]}},'a'.repeat(64))
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].header['If-Match'],'"3"');h.respond(0,200,{order_revision:4});await pending
})
test('version precondition survives DELETE and uncertain retries, conflicts release the old request', async () => {
  const h = harness(), token = 'a'.repeat(64)
  const options = {method:'DELETE',revision:7}
  const first = h.transport.send('/items/1', options, token)
  assert.equal(h.calls[0].header['If-Match'], '"7"')
  const id = h.calls[0].header['Idempotency-Key']
  h.calls[0].fail({}); await assert.rejects(first)
  const again = h.transport.send('/items/1', options, token)
  assert.equal(h.calls[1].header['Idempotency-Key'], id)
  h.respond(1,409,{code:'ITEM_VERSION_CONFLICT',retry_same_request:false}); await again
  const next = h.transport.send('/items/1', options, token)
  assert.notEqual(h.calls[2].header['Idempotency-Key'], id)
  h.respond(2,409,{retry_same_request:true}); await next
  const databaseRetry = h.transport.send('/items/1', options, token)
  assert.equal(h.calls[3].header['Idempotency-Key'],h.calls[2].header['Idempotency-Key'])
  h.respond(3,204,null); await databaseRetry
  const newer = h.transport.send('/items/1',{method:'DELETE',revision:8},token)
  assert.equal(h.calls[4].header['If-Match'],'"8"'); h.respond(4,204,null); await newer
})
function harness(storage = new Map(), user = { id: 1 }) {
  const config = { API_TRANSPORT: 'cloud_http_function', CLOUDBASE_ENV_ID: 'cloud1-example', CLOUD_FUNCTION: 'evil-client-target' }
  const calls = [], timers = new Map(); let timerId = 0
  const globals = { getApp: () => ({ globalData: { user } }), wx: {
    getStorageSync: k => storage.has(k) ? JSON.parse(storage.get(k)) : undefined,
    setStorageSync: (k, v) => storage.set(k, JSON.stringify(v)),
    cloud: { callHTTPFunction: spec => { calls.push(spec); return Promise.resolve() }, callFunction: () => { throw Error('Bridge called') } }
  }, setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id),
  Map, Promise, Math, Date, JSON, Number, Error, encodeURIComponent, unescape }
  function load(file, requires) {
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/utils', file), 'utf8'), { ...globals, module, require: requires })
    return module.exports
  }
  const http = load('cloud-http.js', () => {})
  const transport = load('cloud-transport.js', name => name === '../config' ? config : http)
  function respond(index, statusCode, data) { calls[index].success({ statusCode: 200, data: JSON.stringify({ palm_http: 1, statusCode, data }) }) }
  return { transport, calls, config, storage, user, timers, respond }
}
test('checkout restores signed data from response header and never persists fresh login codes',async()=>{
 const h=harness(),p=h.transport.send('/pay/order',{method:'POST',data:{plan_id:'quarter',code:'fresh-sensitive-code'}},'a'.repeat(64))
 assert.equal(h.storage.size,0)
 const signData=JSON.stringify({env:0,outTradeNo:'P'+'a'.repeat(30)}),payData={signData,mode:'short_series_goods',paySig:'a'.repeat(64),signature:'b'.repeat(64)}
 h.calls[0].success({data:{palm_http:1,statusCode:201,data:{order:{id:'P'+'a'.repeat(30)}}},header:{'X-Palm-Pay-Data':JSON.stringify(payData)}})
 assert.equal((await p).data.payData.signData,signData);assert.equal(h.storage.size,0)
 const bad=h.transport.send('/pay/order',{method:'POST',data:{plan_id:'quarter',code:'other-code'}},'a'.repeat(64))
 h.respond(1,201,{order:{}});await assert.rejects(bad)
})
test('all membership routes use the real fixed HTTP transport and preserve payment retry identity',async()=>{
 const h=harness(),id='a'.repeat(32)
 for(const route of ['/membership','/member/books','/member/books/'+id,'/member/entries','/member/entries/move','/member/budget?month=2026-10','/member/appearance']){
  const pending=h.transport.send(route,{},'member');const i=h.calls.length-1;assert.equal(h.calls[i].path,'/api/mp'+route);h.respond(i,200,{});await pending
 }
 const options={method:'POST',revision:4,data:{amount:'39',paid_on:'2026-10-15',cycle_index:0}},route='/fixed-expenses/1/payments';let i=h.calls.length
 const first=h.transport.send(route,options,'member');const requestId=h.calls[i].header['Idempotency-Key'];h.calls[i].fail({});await assert.rejects(first)
 const retry=h.transport.send(route,options,'member');i++;assert.equal(h.calls[i].header['Idempotency-Key'],requestId);assert.equal(h.calls[i].header['If-Match'],'"4"');h.respond(i,201,{id:1});await retry
 for(const bad of ['/membership/grant','/member/../users','/member/books/'+id+'/grant','/member/bills','/member/bills/1/confirm','/member/plans/1/book'])await assert.rejects(h.transport.send(bad,{method:'POST',data:{}},'member'))
})
test('wish conversion and expense ledger routes carry owner session, revision and durable request IDs',async()=>{
  const h=harness()
  for(const path of ['/wishlist','/wishlist/4/convert','/fixed-expenses','/fixed-expenses/5/payments','/fixed-expenses/5/payments/6']){
    const call=h.transport.send(path,{method:'POST',data:{name:'测试'},revision:3},'a'.repeat(64))
    const i=h.calls.length-1;assert.equal(h.calls[i].path,'/api/mp'+path);assert.equal(h.calls[i].header['If-Match'],'"3"');assert.ok(h.calls[i].header['Idempotency-Key'])
    h.respond(i,201,{id:1});await call
  }
  await assert.rejects(h.transport.send('/fixed-expenses/5/payments/../users',{method:'POST',data:{}},'a'.repeat(64)))
})
test('fixed HTTP function carries session/query/JSON/request ID; business errors preserve status and body', async () => {
  const h = harness()
  const p = h.transport.send('/items?sort=recent', { method: 'POST', data: { name: '相机' } }, 'a'.repeat(64))
  const call = h.calls[0]
  assert.equal(call.name, 'palm-api'); assert.equal(call.method, 'post'); assert.equal(call.path, '/api/mp/items?sort=recent')
  assert.equal(call.timeout, 20000); assert.equal(call.header.Authorization, 'Bearer ' + 'a'.repeat(64))
  assert.ok(call.header['Idempotency-Key']); assert.equal(call.header['X-Palm-Bridge'], undefined)
  assert.deepEqual(Object.keys(call.header).sort(), ['Authorization', 'Content-Type', 'Idempotency-Key'])
  h.respond(0, 400, { error: '维修日期不能早于购买日期' })
  const result = await p; assert.equal(result.statusCode, 400); assert.equal(result.data.error, '维修日期不能早于购买日期')
  const expired = h.transport.send('/items', {}, 'old-token')
  h.respond(1, 401, { error: '登录已过期' }); assert.equal((await expired).statusCode, 401)
})
test('cancelled/timeout submissions retain ID, ignore late replies and retry once across runtime restart', async () => {
  const h = harness(), options = { method: 'POST', data: { name: 'Camera' } }
  const p = h.transport.send('/items', options, 'old-token')
  assert.equal(p, h.transport.send('/items', options, 'old-token'))
  const id = h.calls[0].header['Idempotency-Key']
  p.cancel(); await assert.rejects(p, /已取消/)
  h.respond(0, 201, { id: 1 })
  assert.doesNotMatch(JSON.stringify([...h.storage]), /old-token/)
  const restart = harness(h.storage)
  const retry = restart.transport.send('/items', options, 'new-token')
  assert.equal(restart.calls[0].header['Idempotency-Key'], id)
  for (const fn of restart.timers.values()) fn()
  await assert.rejects(retry, /超时/)
  const next = harness(h.storage); const success = next.transport.send('/items', options, 'renewed-token')
  assert.equal(next.calls[0].header['Idempotency-Key'], id)
  next.respond(0, 201, { id: 1 }); await success
})
test('mode/environment/account isolate retries and unsupported input never calls the SDK', async () => {
  const h = harness(), options = { method: 'POST', data: {} }
  const p = h.transport.send('/items', options, 'alice'); h.user.id = 2
  const q = h.transport.send('/items', options, 'bob')
  assert.notEqual(h.calls[0].header['Idempotency-Key'], h.calls[1].header['Idempotency-Key'])
  assert.equal(h.storage.size, 2)
  const scope = h.transport.serviceScope(); h.config.API_TRANSPORT = 'cloud_function'
  assert.notEqual(h.transport.serviceScope(), scope); h.config.API_TRANSPORT = 'cloud_http_function'
  h.respond(0, 201, {}); h.respond(1, 201, {}); await Promise.all([p, q])
  for (const [route, option] of [['/admin', {}], ['/items', { header: { 'X-Palm-Bridge': 'secret' } }],
    ['/items', { method: 'POST', data: { name: '猫'.repeat(22000) } }], ['/items/1', { method: 'DELETE', data: {} }]]) {
    await assert.rejects(h.transport.send(route, option, 'token'))
  }
  h.config.CLOUDBASE_ENV_ID = 'other'
  await assert.rejects(h.transport.send('/items', {}, 'token'), /环境/)
  assert.equal(h.calls.length, 2)
})
test('network failures sanitize diagnostics; malformed or missing envelopes cannot become successes', async () => {
  const h = harness(); const p = h.transport.send('/items', {}, 'token')
  h.calls[0].fail({ errCode: -501000, errMsg: 'apikey=secret&signature=secret' })
  await assert.rejects(p, e => e.message.includes('-501000') && !e.message.includes('secret'))
  const q = h.transport.send('/items', {}, 'token')
  h.calls[1].success({ statusCode: 200, data: { ok: true } }); await assert.rejects(q)
  const forbidden = h.transport.send('/items', {}, 'token'); h.calls[2].fail({ errCode: 403 })
  assert.equal((await forbidden).statusCode, 403)
})
test('direct login restores the session from response headers and rejects a missing or malformed header', async () => {
  const h = harness(), token = 'a'.repeat(64)
  const login = h.transport.send('/auth/login', { method: 'POST', data: { code: 'wx-code' }, anonymous: true }, '')
  const body = { palm_http: 1, statusCode: 200, data: { user: { id: 1 } } }
  h.calls[0].success({ statusCode: 200, data: JSON.stringify(body), header: { 'x-palm-session': token } })
  assert.equal((await login).data.token, token)
  assert.equal(body.data.token, undefined)
  assert.doesNotMatch(JSON.stringify([...h.storage]), new RegExp(token))
  for (const header of [{}, { 'X-Palm-Session': 'invalid' }]) {
    const pending = h.transport.send('/auth/login', { method: 'POST', data: { code: 'next-code' }, anonymous: true }, '')
    h.calls.at(-1).success({ statusCode: 200, data: JSON.stringify(body), header })
    await assert.rejects(pending)
  }
})

test('retired tagging and custom analysis routes never reach the native transport',async()=>{
 const h=harness(),token='a'.repeat(64);for(const path of ['/member/tags','/member/tags/'+token.slice(0,32),'/member/entries/'+token.slice(0,32)+'/tags','/member/analysis/run','/member/analysis-presets'])await assert.rejects(h.transport.send(path,{method:'GET'},token));assert.equal(h.calls.length,0)
})
