const test = require('node:test')
const assert = require('node:assert/strict')
const { validate, createHandler, checkSignedUrl } = require('../deploy/cloudbase/bridge')
const env = { PALM_API_HOST: 'cloud1-test-123.ap-shanghai.app.tcloudbase.com',
  PALM_API_URL: 'https://cloud1-test-123.ap-shanghai.app.tcloudbase.com/palm/', PALM_BRIDGE_SECRET: 'b'.repeat(48),
  CLOUDBASE_ENV_ID: 'cloud1-test', CLOUDBASE_STORAGE_BUCKET: 'test-bucket',
  CLOUDBASE_STORAGE_HOST: 'test-bucket.cos.ap-shanghai.myqcloud.com' }
const request = overrides => ({ method: 'GET', path: '/api/mp/items', session_token: 'a'.repeat(64), ...overrides })

test('bridge refuses alternate destinations, credential headers and non-business paths', async () => {
  for (const value of [request({ url: 'https://evil.test' }), request({ headers: { 'X-Palm-Bridge': 'evil' } }),
    request({ api_key: 'admin' }), request({ path: '/internal/maintenance' }), request({ path: '//evil.test' }),
    request({ path: '/api/mp/items/../auth/me' }), request({ path: '/api/mp/items#secret' })]) {
    assert.throws(() => validate(value, env))
  }
  assert.throws(() => validate(request(), { ...env, PALM_API_URL: 'https://evil.test/palm/' }))
  assert.throws(() => validate(request({ method: 'POST', body: { x: 'x'.repeat(65536) }, request_id: 'key-1234567890123456' }), env))
  const spec = validate(request({ method: 'PUT', path: '/api/mp/items/42?status=idle', body: { name: 'A' }, request_id: 'key-1234567890123456' }), env)
  assert.equal(spec.url.href, env.PALM_API_URL + 'api/mp/items/42?status=idle')
  assert.equal(spec.headers['X-Palm-Bridge'], env.PALM_BRIDGE_SECRET)
  assert.equal(spec.headers.Authorization, 'Bearer ' + 'a'.repeat(64))
  assert.equal(spec.headers['Idempotency-Key'], 'key-1234567890123456')
  assert.deepEqual(JSON.parse(spec.raw), { name: 'A' })
})

test('bridge preserves upstream statuses and sanitizes failed calls', async () => {
  const empty = await createHandler(env, async () => ({ statusCode: 204, data: '' }))(request())
  assert.deepEqual(empty, { statusCode: 204, data: '' })
  const failed = await createHandler(env, async () => { throw new Error('Authorization=secret&signature=private') })(request())
  assert.equal(failed.statusCode, 503)
  assert.doesNotMatch(JSON.stringify(failed), /secret|signature/)
})

test('WeChat-added identity and context are ignored and cannot authorize or override a request', async () => {
  const login = { method: 'POST', path: '/api/mp/auth/login', body: { code: 'wechat-code' },
    userInfo: { openId: 'platform-openid', api_key: 'admin', headers: { 'X-Palm-Bridge': 'evil' } },
    tcbContext: { envId: 'other-env', url: 'https://evil.test', session_token: 'a'.repeat(64) } }
  const spec = validate(login, env)
  assert.deepEqual(JSON.parse(spec.raw), { code: 'wechat-code' })
  assert.equal(spec.headers['X-Palm-Bridge'], env.PALM_BRIDGE_SECRET)
  assert.equal(spec.headers.Authorization, undefined)
  assert.throws(() => validate({ method: 'GET', path: '/api/mp/items', userInfo: { openId: 'anything' },
    tcbContext: { session_token: 'a'.repeat(64) } }, env), /INVALID_SESSION/)
  assert.throws(() => validate({ ...login, url: 'https://evil.test' }, env), /INVALID_REQUEST_FIELDS/)
  const result = await createHandler({ ...env, PALM_API_URL: 'secret-invalid-url' })(login)
  assert.equal(result.statusCode, 503)
  assert.equal(result.data.code, 'INVALID_CONFIG')
  assert.doesNotMatch(JSON.stringify(result), /secret-invalid-url|wechat-code|platform-openid|admin/)
})

test('only an owner-authorized photo ID can receive a verified five-minute private URL', async () => {
  const now = Math.floor(Date.now() / 1000)
  const signed = `https://${env.CLOUDBASE_STORAGE_HOST}/palm/photos/${'a'.repeat(32)}.jpg?q-sign-time=${now};${now + 300}&q-signature=test`
  const photo = { file_id: `cloud://${env.CLOUDBASE_ENV_ID}.${env.CLOUDBASE_STORAGE_BUCKET}/palm/photos/${'a'.repeat(32)}.jpg`, version: 'v1' }
  const send = async () => ({ statusCode: 200, data: photo })
  const event = request({ path: '/api/mp/items/42/photo/download?size=full' })
  const result = await createHandler(env, send, async () => signed)(event)
  assert.equal(result.statusCode, 200)
  assert.equal(result.data.url, signed.replace(';', ';'))
  assert.equal(result.data.file_id, undefined)
  for (const url of [signed.replace(env.CLOUDBASE_STORAGE_HOST, 'evil.test'), signed.replace(String(now + 300), String(now + 3600)),
    `https://${env.CLOUDBASE_STORAGE_HOST}/public.jpg`, signed.replace('https:', 'http:')]) {
    assert.throws(() => checkSignedUrl(url, env.CLOUDBASE_STORAGE_HOST, now))
  }
  const long = await createHandler(env, send, async () => signed.replace(String(now + 300), String(now + 3600)))(event)
  assert.equal(long.statusCode, 503)
  let signingCalled = false
  const foreign = await createHandler(env, async () => ({ statusCode: 200, data: { ...photo, file_id: 'cloud://other/palm/photos/a.jpg' } }),
    async () => { signingCalled = true; return signed })(event)
  assert.equal(foreign.statusCode, 503)
  assert.equal(signingCalled, false)
})
