const api = require('../../../utils/api')
const transport = require('../../../utils/cloud-transport')
const {platform} = require('../../../utils/payment-platform')
const locks = new Map()
function atLeast(version, minimum) {
  const values = String(version || '').split('.').map(Number)
  if (values.some(n => !Number.isFinite(n))) return false
  for (let i = 0; i < minimum.length; i++) {
    const actual = values[i] || 0
    if (actual !== minimum[i]) return actual > minimum[i]
  }
  return true
}
function checkDevice(iosEnabled) {
  const info = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
  const device = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getSystemInfoSync()
  if (device.platform === 'ios' && !atLeast(info.version, [8, 0, 68])) throw Error('请将微信更新至最新版后再订阅')
  if (device.platform === 'ios' && !iosEnabled) throw Error('iOS订阅暂未开放')
  if (device.platform === 'devtools') throw Error('请在手机微信中验证支付')
  if (!platform()) throw Error('当前终端暂不支持购买会员')
  if (!atLeast(info.SDKVersion, [2, 19, 2]) || typeof wx.requestVirtualPayment !== 'function' ||
      typeof wx.canIUse !== 'function' || !wx.canIUse('requestVirtualPayment')) throw Error('当前微信暂不支持，请更新后再试')
}
function scope() {
  const app = getApp(), token = app.globalData.token, user = app.globalData.user
  if (!token || !user || !user.id) throw Error('请先登录')
  return { token, key: `palmPayment:${transport.serviceScope()}:${user.id}` }
}
function current(context) {
  if (getApp().globalData.token !== context.token) throw Error('登录账户已切换，请重新打开会员页')
}
function pending(context) {
  const value = wx.getStorageSync(context.key)
  return /^P[0-9a-f]{30}$/.test(value || '') ? value : ''
}
function remember(context, id) { current(context); wx.setStorageSync(context.key, id) }
function nativeFailure(error, payData, signed) {
  const rawCode = error && error.errCode
  const code = (typeof rawCode === 'number' && Number.isSafeInteger(rawCode)) ||
    (typeof rawCode === 'string' && /^-?\d{1,12}$/.test(rawCode)) ? String(rawCode) : ''
  let detail = String(error && (error.errMsg || error.message) || '').slice(0, 4096)
  for (const value of [payData.signData, payData.paySig, payData.signature, signed.attach, signed.outTradeNo, signed.offerId]) {
    if (typeof value === 'string' && value) detail = detail.split(value).join('[隐藏]')
  }
  detail = detail.replace(/https?:\/\/\S+/gi, '[链接隐藏]')
    .replace(/\b(access_token|session_key|pay_sig|appkey|app_key|appsecret|secret|signature)\b["']?\s*[=:]\s*["']?[^\s,;"'}]+/gi, '$1=[隐藏]')
    .replace(/[A-Za-z0-9_-]{16,}/g, '[标识隐藏]').replace(/\s+/g, ' ').slice(0, 180)
  return '微信支付调用未完成' + (code ? `（支付错误码${code}）` : '') + (detail ? '；支付说明：' + detail : '')
}
async function query(context, id, allowRetry = false) {
  current(context)
  const response = await api.request('/pay/query', { method: 'POST', data: { out_trade_no: id } })
  current(context)
  const order = response.order
  if (!order || order.id !== id) throw Error('订单结果暂时无法确认，请稍后核对')
  if (['fulfilled', 'closed', 'refunded', 'partial_refund'].includes(order.status) || allowRetry && order.can_purchase_again) remember(context, '')
  return order
}
async function recover(context) {
  let id = pending(context)
  if (!id) {
    const response = await api.request('/pay/orders')
    current(context)
    const unfinished = response.orders.find(o => o.status === 'pending' && !o.can_purchase_again)
    id = unfinished && unfinished.id
    if (id) remember(context, id)
  }
  return id ? query(context, id, true) : null
}
function exclusive(operation) {
  const context = scope()
  if (locks.has(context.key)) return locks.get(context.key)
  const promise = operation(context)
  locks.set(context.key, promise)
  promise.finally(() => { if (locks.get(context.key) === promise) locks.delete(context.key) }).catch(() => {})
  return promise
}
function buy(planId, iosEnabled, expectedPriceCents) {
  return exclusive(async context => {
    checkDevice(iosEnabled)
    const old = await recover(context)
    if (old && old.status === 'fulfilled') return { kind: 'confirmed', order: old }
    if (old && old.status === 'pending' && !old.can_purchase_again) throw Error('上次支付仍待确认，请先核对订单，勿重复付款')
    current(context)
    const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: () => reject(Error('微信登录失败，请重试')) }))
    current(context)
    if (!login.code) throw Error('无法取得微信登录凭证，请重试')
    if (!Number.isSafeInteger(expectedPriceCents) || expectedPriceCents < 1) throw Error('请刷新会员页并核对价格后重试')
    const response = await api.request('/pay/order', { method: 'POST', data: { plan_id: planId, code: login.code, platform:platform(), expected_price_cents:expectedPriceCents } })
    current(context)
    const id = response.order && response.order.id
    if (!/^P[0-9a-f]{30}$/.test(id || '') || !response.payData || response.payData.mode !== 'short_series_goods') throw Error('订阅下单结果异常，请先核对订单')
    let signed
    try { signed = JSON.parse(response.payData.signData) } catch (_) { throw Error('支付参数异常，请先核对订单') }
    if (signed.outTradeNo !== id || signed.goodsPrice !== response.order.price_cents || signed.env !== 0 ||
        signed.buyQuantity !== 1 || signed.currencyType !== 'CNY' || !/^[a-f0-9]{64}$/.test(response.payData.paySig || '') ||
        !/^[a-f0-9]{64}$/.test(response.payData.signature || '')) throw Error('支付参数异常，请先核对订单')
    if (expectedPriceCents !== undefined && (!Number.isSafeInteger(expectedPriceCents) ||
        expectedPriceCents < 1 || signed.goodsPrice !== expectedPriceCents)) throw Error('价格已更新，请刷新会员页并核对金额后重试')
    // Persist only the order ID, before launching payment. Never persist payData.
    remember(context, id)
    let nativeError = '微信支付调用未完成'
    const outcome = await new Promise(resolve => {
      try { wx.requestVirtualPayment({ ...response.payData,
        success: () => resolve('submitted'), fail: error => {
          nativeError = nativeFailure(error, response.payData, signed)
          resolve(/cancel/i.test(error && error.errMsg || '') ? 'cancelled' : 'unknown')
        } }) }
      catch (error) { nativeError = nativeFailure(error, response.payData, signed); resolve('unknown') }
    })
    current(context)
    if (outcome === 'cancelled') { remember(context, ''); return { kind: 'cancelled' } }
    for (let i = 0; i < 4; i++) {
      if (i) await new Promise(resolve => setTimeout(resolve, 1500))
      let order
      try { order = await query(context, id) }
      catch (error) {
        if (outcome === 'unknown') throw Error(nativeError + '；' + error.message)
        throw error
      }
      if (order.status === 'fulfilled') return { kind: 'confirmed', order }
      if (['closed', 'refunded', 'partial_refund'].includes(order.status)) return { kind: order.status, order }
      if (outcome === 'unknown' && order.lookup_state === 'not_found') throw Error(nativeError + '；微信暂未查到该订单，请保留原单核对')
    }
    if (outcome === 'unknown') throw Error(nativeError + '；请核对原订单和微信账单，勿重复付款')
    return { kind: 'pending' }
  })
}
function checkPending() { return exclusive(recover) }
async function history() { const context = scope(), response = await api.request('/pay/orders'); current(context); return response.orders }
module.exports = { atLeast, checkDevice, buy, checkPending, history }
