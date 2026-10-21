const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const tick = () => new Promise(resolve => setImmediate(resolve))
function harness(storage = new Map(), user = { id: 1 }) {
  const config = { API_TRANSPORT: 'cloud_function', CLOUDBASE_ENV_ID: 'cloud1-test', CLOUD_FUNCTION: 'palm-api-bridge' }
  const calls = [], module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/utils/cloud-transport.js'), 'utf8'),
    { module, require: () => config, getApp: () => ({ globalData: { user } }), wx: {
      getStorageSync: key => storage.has(key) ? JSON.parse(storage.get(key)) : undefined,
      setStorageSync: (key, value) => storage.set(key, JSON.stringify(value)),
      cloud: { callFunction: spec => calls.push(spec) } }, Map, Promise, Math, Date, JSON, Number, Error })
  return { transport: module.exports, calls, config, user, storage }
}

test('platform failures expose only a bounded error number, never raw diagnostic credentials', async () => {
  const h = harness()
  const first = h.transport.send('/auth/login', { method: 'POST', anonymous: true }, '')
  h.calls[0].fail({ errCode: -504003, errMsg: 'token=private-secret' })
  await assert.rejects(first, error => error.message.includes('-504003') && !error.message.includes('private-secret'))
  const second = h.transport.send('/items', {}, 'session-secret')
  h.calls[1].fail({ errMsg: 'cloud error -501000 token=private-secret' })
  await assert.rejects(second, error => error.message.includes('-501000') && !error.message.includes('private-secret'))
  const third = h.transport.send('/items', {}, '')
  h.calls[2].fail({ errCode: 'private-secret', errMsg: 'token=private-secret' })
  await assert.rejects(third, error => error.message === '云端连接失败，请检查网络后重试')
})
test('uncertain cloud mutations deduplicate in flight and retry the same request ID', async () => {
  const h = harness(), options = { method: 'POST', data: { name: 'Camera' } }
  const first = h.transport.send('/items', options, 'alice'), duplicate = h.transport.send('/items', options, 'alice')
  assert.equal(first, duplicate); assert.equal(h.calls.length, 1)
  const id = h.calls[0].data.request_id
  h.calls[0].fail(); await assert.rejects(first); await tick()
  const retry = h.transport.send('/items', options, 'alice')
  assert.equal(h.calls[1].data.request_id, id)
  h.calls[1].success({ result: { statusCode: 201, data: { id: 1 } } }); await retry; await tick()
  const next = h.transport.send('/items', options, 'alice')
  assert.notEqual(h.calls[2].data.request_id, id)
  h.calls[2].success({ result: { statusCode: 201, data: { id: 2 } } }); await next
})
test('cloud requests separate accounts/environments and keep all administrator credentials off the client', async () => {
  const h = harness()
  const a = h.transport.send('/items', { method: 'POST', data: {} }, 'alice')
  h.user.id = 2
  const b = h.transport.send('/items', { method: 'POST', data: {} }, 'bob')
  assert.equal(h.calls.length, 2)
  assert.notEqual(h.calls[0].data.request_id, h.calls[1].data.request_id)
  assert.deepEqual(Object.keys(h.calls[0].data).sort(), ['body', 'method', 'path', 'request_id', 'session_token'])
  assert.equal(h.calls[0].config.env, 'cloud1-test')
  assert.equal(h.calls[0].name, 'palm-api-bridge')
  const scope = h.transport.serviceScope(); h.config.CLOUDBASE_ENV_ID = 'other'; assert.notEqual(h.transport.serviceScope(), scope)
  h.calls.forEach(call => call.success({ result: { statusCode: 201, data: {} } })); await Promise.all([a, b])
  const login = h.transport.send('/auth/login', { method: 'POST', anonymous: true, data: { code: 'wechat-code' } }, '')
  assert.equal(h.calls[2].data.session_token, undefined)
  assert.equal(h.calls[2].data.request_id, undefined)
  h.calls[2].success({ result: { statusCode: 200, data: {} } }); await login
})
test('a new runtime/session reuses a pending submission without persisting raw tokens', async () => {
  const storage = new Map(), first = harness(storage), options = { method: 'POST', data: { name: 'Camera' } }
  const pending = first.transport.send('/items', options, 'old-session-token')
  const id = first.calls[0].data.request_id
  first.calls[0].fail(); await assert.rejects(pending)
  assert.doesNotMatch(JSON.stringify([...storage]), /old-session-token/)
  const restart = harness(storage)
  const retry = restart.transport.send('/items', options, 'renewed-session-token')
  assert.equal(restart.calls[0].data.request_id, id)
  restart.calls[0].success({ result: { statusCode: 201, data: { id: 1 } } }); await retry
  assert.equal(JSON.parse([...storage.values()][0]).rows && Object.keys(JSON.parse([...storage.values()][0]).rows).length, 0)
})
