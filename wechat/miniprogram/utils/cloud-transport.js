// JSON-only cloud transport. Failed mutations retain their request ID for retries.
const config = require('../config')
const http = require('./cloud-http')
const pending = new Map(), retries = new Map()
let counter = 0
function serviceScope() {
  if(typeof getApp==='function'&&getApp()?.globalData?.localMode)return 'local-device-v1:'+require('../local-core/runtime').scope()
  if (config.API_TRANSPORT === 'cloud_http_function') return `cloud_http_function:${config.CLOUDBASE_ENV_ID}:palm-api`
  return config.API_TRANSPORT === 'cloud_function'
    ? `cloudbase:${config.CLOUDBASE_ENV_ID}:${config.CLOUD_FUNCTION}` : config.API_BASE
}
function clear() { retries.clear() }
function journalContext(method, path, body, revision) {
  // Fresh wx.login codes and signed checkout data must never enter storage.
  if (/^\/pay\//.test(path)) return null
  const user = typeof getApp === 'function' && getApp().globalData.user
  if (!user || !user.id || typeof wx.getStorageSync !== 'function') return null
  const key = `palmRequests:${serviceScope()}:${user.id}`
  const stored = wx.getStorageSync(key)
  const rows = stored && stored.version === 1 && stored.rows || {}
  // No session tokens, keys or signed URLs are stored in the retry journal.
  return { key, rows, fingerprint: JSON.stringify(revision === undefined ? [method, path, body] : [method, path, body, revision]) }
}
function saveJournal(journal) {
  if (journal) wx.setStorageSync(journal.key, { version: 1, rows: journal.rows })
}
function send(path, options, token) {
  if (path === '/pay/order' && config.API_TRANSPORT === 'cloud_function') return Promise.reject(new Error('请更新小程序后再订阅会员'))
  if (Object.keys(options).some(key => !['method', 'data', 'anonymous', 'requestId', 'revision'].includes(key))) return Promise.reject(new Error('请求参数无效'))
  if (options.revision !== undefined && (!Number.isSafeInteger(options.revision) || options.revision < 0)) return Promise.reject(new Error('物品版本无效，请重新打开物品'))
  if (options.revision !== undefined && config.API_TRANSPORT !== 'cloud_http_function' && !/^\/(member|ledger|wishlist|fixed-expenses|storage-locations)(\/|$)/.test(path)) return Promise.reject(new Error('请更新小程序使用云端直连'))
  const method = options.method || 'GET'
  const mutation = method !== 'GET' && !options.anonymous
  const fingerprint = JSON.stringify([serviceScope(), token, method, path, options.data, options.revision])
  if (mutation && pending.has(fingerprint)) return pending.get(fingerprint)
  let journal
  try { if (mutation) journal = journalContext(method, path, options.data, options.revision) }
  catch (_) { return Promise.reject(new Error('提交编号无法保存，请检查本机存储后重试')) }
  const stored = journal && journal.rows[journal.fingerprint]
  if (stored && Date.now() - stored.created_at > 23 * 3600 * 1000) {
    return Promise.reject(new Error('上次提交结果未确认且已超过安全重试期限，请先核对云端记录'))
  }
  let requestId = options.requestId || (stored && stored.id) || retries.get(fingerprint)
  if (mutation && !requestId) {
    requestId = `palm-${Date.now().toString(36)}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
    if (retries.size >= 100) return Promise.reject(new Error('未确认提交过多，请先重试现有操作'))
    retries.set(fingerprint, requestId)
  }
  if (journal && !stored) {
    if (Object.keys(journal.rows).length >= 100) return Promise.reject(new Error('未确认提交过多，请先核对现有操作'))
    journal.rows[journal.fingerprint] = { id: requestId, created_at: Date.now() }
    try { saveJournal(journal) }
    catch (_) { return Promise.reject(new Error('提交编号无法保存，请检查本机存储后重试')) }
  }
  const data = { method, path: `/api/mp${path}` }
  if (options.data !== undefined) data.body = options.data
  if (!options.anonymous) data.session_token = token
  if (mutation) data.request_id = requestId
  if (options.revision !== undefined) data.revision = options.revision
  let task
  const promise = new Promise((resolve, reject) => {
    const callbacks = {
      success(response) {
        const result = config.API_TRANSPORT === 'cloud_http_function' ? response : response.result
        if (!result || !Number.isInteger(result.statusCode)) { reject(new Error('云端响应无效')); return }
        if (typeof result.data === 'string' && result.statusCode !== 204) {
          try { result.data = JSON.parse(result.data) } catch (_) { reject(new Error('云端响应无效')); return }
        }
        if (mutation && result.statusCode !== 401 && result.statusCode < 500 && (result.statusCode !== 409 ||
            (['ITEM_VERSION_CONFLICT','LOCATION_NAME_EXISTS','ITEM_CAPACITY_REACHED'].includes(result.data?.code) && result.data.retry_same_request === false))) {
          retries.delete(fingerprint)
          if (journal) {
            // Reread so another request's receipt cannot be erased by this response.
            try {
              const current = journalContext(method, path, options.data, options.revision)
              if (current && current.key === journal.key && current.rows[current.fingerprint]?.id === requestId) {
                delete current.rows[current.fingerprint]; saveJournal(current)
              }
            } catch (_) { /* Keeping a receipt is safe: the backend replays it. */ }
          }
        }
        resolve(result)
      }, fail(error) {
        if (error && error.kind === 'cancelled') { reject(new Error('请求已取消；提交结果请先核对，重试将复用原编号')); return }
        if (error && (error.kind === 'timeout' || error.errCode === -9999)) { reject(new Error('云端响应超时，请重试；提交将复用原编号')); return }
        // Only a bounded platform error number is safe to display; messages may contain credentials.
        const value = error && error.errCode
        const matched = error && typeof error.errMsg === 'string' && error.errMsg.match(/(?:^|[^\d])(-\d{6})(?!\d)/)
        const code = Number.isInteger(value) && value <= -100000 && value >= -999999
          ? value : matched ? Number(matched[1]) : null
        reject(new Error(`云端连接失败，请检查网络后重试${code === null ? '' : `（${code}）`}`))
      }
    }
    try {
      task = config.API_TRANSPORT === 'cloud_http_function' ? http.call(config, data, callbacks)
        : wx.cloud.callFunction({ name: config.CLOUD_FUNCTION, config: { env: config.CLOUDBASE_ENV_ID }, data, ...callbacks })
    } catch (error) { reject(error) }
  })
  promise.cancel = () => { if (task && task.abort) task.abort() }
  if (mutation) {
    pending.set(fingerprint, promise)
    promise.finally(() => { if (pending.get(fingerprint) === promise) pending.delete(fingerprint); if (/^\/pay\//.test(path)) retries.delete(fingerprint) }).catch(() => {})
  }
  return promise
}
module.exports = { send, clear, serviceScope }
