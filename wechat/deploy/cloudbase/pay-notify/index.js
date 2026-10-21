// Event receiver and five-minute reconciliation timer. Never log event payloads.
const https = require('node:https')
const crypto = require('node:crypto')

function target(env) {
  const url = new URL(env.PALM_PAY_RELAY_URL || '')
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      url.hostname !== env.PALM_PAY_RELAY_HOST || !/^[a-z0-9-]+\.ap-shanghai\.app\.tcloudbase\.com$/.test(url.hostname) ||
      url.pathname !== '/palm/payments/wechat/notify' || (env.PALM_PAY_NOTIFY_SECRET || '').length < 32) throw Error('INVALID_CONFIG')
  return url
}
function send(url, raw, headers) {
  return new Promise((resolve, reject) => {
    let done=false,req
    const finish=(error,body)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(body)}
    const timer=setTimeout(()=>{req?.destroy(Error('TIMEOUT'));finish(Error('TIMEOUT'))},2500)
    try { req = https.request(url, { method: 'POST', headers, timeout: 2500 }, res => {
      const chunks = []; let size = 0
      res.on('data', part => { size += part.length; if (size > 16384) res.destroy(Error('OVERSIZE')); else chunks.push(part) })
      res.on('error', error=>finish(error))
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (res.statusCode !== 200 || body.ErrCode !== 0) throw Error('NOT_CONFIRMED')
          finish(null,body)
        } catch (_) { finish(Error('NOT_CONFIRMED')) }
      })
    }) } catch(error) { finish(error); return }
    req.on('timeout', () => req.destroy(Error('TIMEOUT')))
    req.on('error', error=>finish(error))
    req.end(raw)
  })
}
function createHandler(env, forward = send, now = () => Math.floor(Date.now() / 1000)) {
  return async event => {
    const started=Date.now()
    try {
      const url = target(env)
      if (!event || typeof event !== 'object') throw Error('INVALID_EVENT')
      let body
      if (event.Type === 'Timer' && event.TriggerName === 'palm-pay-reconcile') body = { action: 'reconcile' }
      else {
        if (!['xpay_goods_deliver_notify', 'xpay_refund_notify'].includes(event.Event) || event.Env !== 0 ||
            typeof event.OpenId !== 'string' || !event.OpenId || event.OpenId.length > 256 ||
            !/^P[0-9a-f]{30}$/.test(event.OutTradeNo || '')) throw Error('INVALID_EVENT')
        body = { Event: event.Event, OpenId: event.OpenId, OutTradeNo: event.OutTradeNo, Env: 0 }
      }
      const raw = JSON.stringify(body), timestamp = String(now())
      const signature = crypto.createHmac('sha256', env.PALM_PAY_NOTIFY_SECRET).update(timestamp + '\n' + raw).digest('hex')
      const result = await forward(url, raw, { 'Content-Type': 'application/json',
        'X-Palm-Pay-Time': timestamp, 'X-Palm-Pay-Signature': signature })
      if (result.ErrCode !== 0) throw Error('NOT_CONFIRMED')
      return { ErrCode: 0, ErrMsg: 'success' }
    } catch (error) {
      const allowed=['TIMEOUT','NOT_CONFIRMED','INVALID_CONFIG','INVALID_EVENT','OVERSIZE']
      console.warn(JSON.stringify({event:'payment_relay_failure',reason:allowed.includes(error?.message)?error.message:'UPSTREAM_FAILURE',elapsed_ms:Date.now()-started}))
      // Returning failure makes WeChat retry. Do not acknowledge before delivery.
      return { ErrCode: 1, ErrMsg: 'payment_unconfirmed' }
    }
  }
}
exports.main = createHandler(process.env)
exports.createHandler = createHandler
