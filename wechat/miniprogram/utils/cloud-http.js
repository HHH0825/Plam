// Fixed native HTTP target. SDK cancellation may only cancel the local wait.
const ENV = 'cloud1-example'
const NAME = 'palm-api'
const photoTransfer = require('./photo-transfer')
const ALLOWED = /^\/api\/mp\/(?:pay\/(?:order|query|orders(?:\/P[0-9a-f]{30})?)|rewards(?:\/(?:checkin|redeem|invitation|greeting|transactions|visit|achievements\/[a-z]+_[0-9]+\/claim))?|local-migration\/(?:status|snapshots(?:\/[a-f0-9]{32}\/(?:confirm|pages\/\d+|photos\/\d+(?:\/prepare)?))?)|membership|member\/(?:books(?:\/(?:order|[a-f0-9]{32}))?|entries(?:\/move)?|budget|appearance)|auth\/(?:login|me|logout)|profile|stats|insights|reports\/monthly|ledger\/(?:settings|statistics|operations\/[A-Za-z0-9_-]{16,100}|history(?:\/import)?|entries(?:\/[a-f0-9]{32}(?:\/refunds)?)?)|storage-locations(?:\/assign|\/\d+)?|wishlist(?:\/\d+(?:\/convert)?)?|fixed-expenses(?:\/\d+(?:\/payments(?:\/\d+)?)?)?|items(?:\/\d+(?:\/(?:daily-target|pin|maintenance|disposal|usage(?:\/today)?|photo(?:\/download|\/uploads(?:\/[a-f0-9]{48}\/commit)?)?))?)?|(?:maintenance|disposal|usage)\/\d+|trash(?:\/\d+(?:\/restore)?)?)$/
function call(config, data, callbacks) {
  if (config.CLOUDBASE_ENV_ID !== ENV) throw new Error('云端环境配置无效')
  if (!wx.cloud || typeof wx.cloud.callHTTPFunction !== 'function') throw new Error('请升级微信以使用云端直连')
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(data.method)
      || typeof data.path !== 'string' || data.path.length > 4096 || /[#\\]/.test(data.path)
      || !ALLOWED.test(data.path.split('?')[0])) throw new Error('请求路径或方法无效')
  const raw = data.body === undefined ? undefined : JSON.stringify(data.body)
  if (raw !== undefined && (!data.body || typeof data.body !== 'object' || Array.isArray(data.body))) throw new Error('请求格式无效')
  if (raw && unescape(encodeURIComponent(raw)).length > 65536) throw new Error('请求内容不能超过 64 KB')
  if ((data.method === 'DELETE' || data.method === 'GET') && data.body !== undefined) throw new Error('此请求方法不支持 JSON 内容')
  const header = { 'Content-Type': 'application/json' }
  if (data.session_token) header.Authorization = `Bearer ${data.session_token}`
  if (data.request_id) header['Idempotency-Key'] = data.request_id
  if (data.revision !== undefined) {
    if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('物品版本无效，请重新打开物品')
    header['If-Match'] = `"${data.revision}"`
  }
  let settled = false, task
  const finish = (kind, value) => {
    if (settled) return
    settled = true; clearTimeout(timer); callbacks[kind](value)
  }
  const timeout = /\/photo\/uploads\/[a-f0-9]{48}\/commit$/.test(data.path) ? 55000 : 20000
  const timer = setTimeout(() => finish('fail', { errCode: -9999, kind: 'timeout' }), timeout)
  try {
    task = wx.cloud.callHTTPFunction({ name: NAME, config: { env: ENV }, path: data.path,
      method: data.method.toLowerCase(), header, timeout, dataType: 'json', responseType: 'text',
      ...(data.body === undefined ? {} : { data: data.body }),
      success: response => {
        let body = response.data
        try { if (typeof body === 'string') body = JSON.parse(body) } catch (_) { return finish('fail', {}) }
        if (!body || body.palm_http !== 1 || !Number.isInteger(body.statusCode)
            || body.statusCode < 100 || body.statusCode > 599) return finish('fail', {})
        if (data.method === 'POST' && data.path.split('?')[0] === '/api/mp/auth/login' && body.statusCode === 200) {
          const headers = response.header || {}
          const name = Object.keys(headers).find(key => key.toLowerCase() === 'x-palm-session')
          const token = name && headers[name]
          if (!/^[a-f0-9]{64}$/.test(token || '') || !body.data || typeof body.data !== 'object') return finish('fail', {})
          body.data.token = token
        }
        const route = data.path.split('?')[0]
        if (data.method === 'POST' && route === '/api/mp/pay/order' && body.statusCode === 201) {
          try {
            const headers = response.header || {}, name = Object.keys(headers).find(key => key.toLowerCase() === 'x-palm-pay-data')
            const raw = name && headers[name]
            if (typeof raw !== 'string' || raw.length > 8192 || !body.data || typeof body.data !== 'object') throw Error()
            const payData = JSON.parse(raw)
            if (typeof payData.signData !== 'string' || payData.mode !== 'short_series_goods' ||
                !/^[a-f0-9]{64}$/.test(payData.paySig) || !/^[a-f0-9]{64}$/.test(payData.signature)) throw Error()
            body.data.payData = payData
          } catch (_) { return finish('fail', {}) }
        }
        if (body.statusCode >= 200 && body.statusCode < 300 &&
            ((data.method === 'POST' && /\/photo\/uploads$/.test(route)) || (data.method === 'GET' && /\/photo\/download$/.test(route)))) {
          try {
            const headers = response.header || {}
            const name = Object.keys(headers).find(key => key.toLowerCase() === 'x-palm-photo-transfer')
            body.data = photoTransfer.restore(body.data, name && headers[name], data.method, route)
          } catch (_) { return finish('fail', {}) }
        }
        finish('success', { statusCode: body.statusCode, data: body.data })
      },
      fail: error => {
        // Platform errors may carry an HTTP status but never carry the backend JSON.
        const status = error && error.errCode
        if (Number.isInteger(status) && status >= 400 && status <= 599) {
          return finish('success', { statusCode: status, data: { error: status === 401 ? '登录已过期，请重新登录' : `云端请求失败（${status}）` } })
        }
        finish('fail', error)
      }
    })
    if (task && typeof task.catch === 'function') task.catch(() => {})
  } catch (_) { finish('fail', {}) }
  return { abort() {
    finish('fail', { kind: 'cancelled' })
    if (task && typeof task.abort === 'function') task.abort()
  } }
}
module.exports = { call, ENV, NAME }
