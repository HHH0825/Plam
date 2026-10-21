/* Fixed JSON bridge. No client credentials or target URL can override server settings. */
const https = require('node:https')
const ALLOWED = /^\/api\/mp\/(?:pay\/(?:order|query|orders(?:\/P[0-9a-f]{30})?)|rewards(?:\/(?:checkin|redeem|invitation|greeting|transactions|visit|achievements\/[a-z]+_[0-9]+\/claim))?|membership|member\/(?:books(?:\/(?:order|[a-f0-9]{32}))?|entries(?:\/move)?|budget|appearance|plans\/\d+\/book|bills(?:\/\d+\/confirm)?)|auth\/(?:login|me|logout)|profile|stats|insights|reports\/monthly|ledger\/(?:settings|statistics|operations\/[A-Za-z0-9_-]{16,100}|history(?:\/import)?|entries(?:\/[a-f0-9]{32}(?:\/refunds)?)?)|storage-locations(?:\/assign|\/\d+)?|wishlist(?:\/\d+(?:\/convert)?)?|fixed-expenses(?:\/\d+(?:\/payments(?:\/\d+)?)?)?|items(?:\/\d+(?:\/(?:daily-target|pin|maintenance|disposal|usage(?:\/today)?|photo(?:\/download|\/uploads(?:\/[a-f0-9]{48}\/commit)?)?))?)?|(?:maintenance|disposal|usage)\/\d+|trash(?:\/\d+(?:\/restore)?)?)$/

function validate(event, env) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('INVALID_REQUEST_TYPE')
  // WeChat adds userInfo and tcbContext to function events. Ignore them: backend sessions
  // determine ownership, and this field must never override credentials or headers.
  const keys = ['method', 'path', 'body', 'session_token', 'request_id', 'revision', 'userInfo', 'tcbContext']
  if (Object.keys(event).some(key => !keys.includes(key))) throw new Error('INVALID_REQUEST_FIELDS')
  const method = event.method || 'GET'
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('INVALID_METHOD')
  if (typeof event.path !== 'string' || event.path.length > 4096 || /[#\\]/.test(event.path)) throw new Error('INVALID_PATH')
  const pathname = event.path.split('?')[0]
  if (!ALLOWED.test(pathname)) throw new Error('INVALID_PATH')
  if (event.body !== undefined && (!event.body || typeof event.body !== 'object' || Array.isArray(event.body))) throw new Error('INVALID_BODY')
  const raw = event.body === undefined ? undefined : JSON.stringify(event.body)
  if (raw && Buffer.byteLength(raw) > 64 * 1024) throw new Error('BODY_TOO_LARGE')
  const anonymous = pathname === '/api/mp/auth/login' && method === 'POST'
  if (!anonymous && !/^[a-fA-F0-9]{64}$/.test(event.session_token || '')) throw new Error('INVALID_SESSION')
  if (!anonymous && method !== 'GET' && !/^[A-Za-z0-9_-]{16,100}$/.test(event.request_id || '')) throw new Error('INVALID_REQUEST_ID')
  let base
  try { base = new URL(env.PALM_API_URL || '') } catch (_) { throw new Error('INVALID_CONFIG') }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.port
      || base.pathname !== '/palm/' || base.hostname !== env.PALM_API_HOST) throw new Error('INVALID_CONFIG')
  if (!/^[a-z0-9-]+\.ap-shanghai\.app\.tcloudbase\.com$/.test(base.hostname)) throw new Error('INVALID_CONFIG')
  if (!env.PALM_BRIDGE_SECRET || env.PALM_BRIDGE_SECRET.length < 32) throw new Error('INVALID_CONFIG')
  const url = new URL(base.href + event.path.slice(1))
  const headers = { 'Content-Type': 'application/json', 'X-Palm-Bridge': env.PALM_BRIDGE_SECRET }
  if (!anonymous) headers.Authorization = `Bearer ${event.session_token}`
  if (method !== 'GET' && !anonymous) headers['Idempotency-Key'] = event.request_id
  if (event.revision !== undefined) {
    if (!Number.isSafeInteger(event.revision) || event.revision < 0) throw new Error('INVALID_ITEM_VERSION')
    headers['If-Match'] = `"${event.revision}"`
  }
  return { url, method, headers, raw, pathname }
}

function forward(spec) {
  return new Promise((resolve, reject) => {
    const request = https.request(spec.url, { method: spec.method, headers: spec.headers, timeout: 45000 }, response => {
      const parts = []; let size = 0
      response.on('data', part => {
        size += part.length
        if (size > 5 * 1024 * 1024) { response.destroy(); reject(new Error('RESPONSE_TOO_LARGE')) } else parts.push(part)
      })
      response.on('error', reject)
      response.on('end', () => {
        if (response.statusCode >= 300 && response.statusCode < 400) return reject(new Error('REDIRECT_REFUSED'))
        let data = ''
        try { if (response.statusCode !== 204) data = JSON.parse(Buffer.concat(parts).toString('utf8')) }
        catch (_) { return reject(new Error('INVALID_RESPONSE')) }
        resolve({ statusCode: response.statusCode, data })
      })
    })
    request.on('timeout', () => request.destroy(new Error('UPSTREAM_TIMEOUT')))
    request.on('error', reject)
    request.end(spec.raw)
  })
}

function checkSignedUrl(value, host, now = Math.floor(Date.now() / 1000)) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port) throw new Error('INVALID_PHOTO_HOST')
  const times = (url.searchParams.get('q-sign-time') || '').split(';').map(Number)
  if (times.length !== 2 || !times.every(Number.isFinite) || times[1] <= now || times[1] > now + 305
      || times[1] - times[0] > 305) throw new Error('PHOTO_TTL_UNVERIFIED')
  return url.href
}

function createHandler(env, send = forward, signer) {
  return async event => {
    let spec
    try { spec = validate(event, env) }
    catch (error) {
      const code = ['INVALID_REQUEST', 'INVALID_REQUEST_TYPE', 'INVALID_REQUEST_FIELDS', 'INVALID_METHOD', 'INVALID_PATH', 'INVALID_BODY',
        'BODY_TOO_LARGE', 'INVALID_SESSION', 'INVALID_REQUEST_ID', 'INVALID_CONFIG'].includes(error.message)
        ? error.message : 'INVALID_REQUEST'
      return { statusCode: code === 'INVALID_CONFIG' ? 503 : 400,
        data: { error: code === 'INVALID_CONFIG' ? '云端转发配置无效，请联系维护者' : '请求格式无效', code } }
    }
    try {
      const result = await send(spec)
      if (spec.method === 'GET' && /\/photo\/download$/.test(spec.pathname) && result.statusCode === 200) {
        const data = result.data
        const prefix = `cloud://${env.CLOUDBASE_ENV_ID}.${env.CLOUDBASE_STORAGE_BUCKET}/palm/photos/`
        if (!data || typeof data.file_id !== 'string' || !data.file_id.startsWith(prefix)
            || !/^[a-f0-9]{32}(?:\.thumb)?\.jpg$/.test(data.file_id.slice(prefix.length))) throw new Error('INVALID_PHOTO_ID')
        const sign = signer || (async fileID => {
          const app = require('@cloudbase/node-sdk').init({ env: env.CLOUDBASE_ENV_ID })
          const signed = await app.getTempFileURL({ fileList: [{ fileID, maxAge: 300, urlType: 'COS_URL' }] }, { timeout: 5000 })
          const row = signed.fileList && signed.fileList[0]
          if (!row || row.code && row.code !== 'SUCCESS') throw new Error('PHOTO_SIGNATURE_FAILED')
          return row.tempFileURL
        })
        const url = checkSignedUrl(await sign(data.file_id), env.CLOUDBASE_STORAGE_HOST)
        result.data = { url, expires_at: Math.floor(Date.now() / 1000) + 300, version: data.version }
      }
      return result
    } catch (error) {
      // Never print upstream URLs, headers, tokens, SDK messages or response bodies.
      return { statusCode: 503, data: { error: error.message === 'PHOTO_TTL_UNVERIFIED'
        ? '照片链接有效期尚未通过验证，请联系维护者' : '云端连接暂不可用，请稍后重试', retry_same_request: true } }
    }
  }
}
exports.main = createHandler(process.env)
exports.createHandler = createHandler
exports.validate = validate
exports.checkSignedUrl = checkSignedUrl
