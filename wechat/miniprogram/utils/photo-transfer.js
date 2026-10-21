// Only the server's fixed private bucket and bounded photo signatures are accepted.
const BUCKET = '636c-cloud1-example-1000000000'
const HOST = `${BUCKET}.cos.ap-shanghai.myqcloud.com`
const MAX = 5 * 1024 * 1024
function decodeJSON(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 4096 || !/^[A-Za-z0-9_+/=-]+$/.test(encoded)) throw Error('照片授权无效')
  const raw = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = new Uint8Array(wx.base64ToArrayBuffer(raw + '='.repeat((4 - raw.length % 4) % 4)))
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return JSON.parse(text)
}
function within(start, end, ttl, now) {
  return Number.isInteger(start) && Number.isInteger(end) && start <= now + 5
    && end > now && end <= now + ttl && end > start && end - start <= ttl
}
function restore(metadata, encoded, method, path) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw Error('照片授权无效')
  if ('url' in metadata || 'form' in metadata || 'headers' in metadata || 'upload_url' in metadata) throw Error('照片授权传输无效')
  const value = decodeJSON(encoded), now = Math.floor(Date.now() / 1000)
  const upload = method === 'POST' && /^\/api\/mp\/items\/\d+\/photo\/uploads$/.test(path)
  const download = method === 'GET' && /^\/api\/mp\/items\/\d+\/photo\/download$/.test(path)
  if (value.v !== 1 || value.kind !== (upload ? 'upload' : download ? 'download' : '')
      || !Number.isInteger(value.expires_at) || value.expires_at !== metadata.expires_at) throw Error('照片授权无效')
  if (upload) {
    if (!/^[a-f0-9]{48}$/.test(metadata.ticket || '') || value.url !== `https://${HOST}/`) throw Error('照片上传地址无效')
    const form = value.form
    const fields = ['key', 'Content-Type', 'acl', 'success_action_status', 'q-sign-algorithm', 'q-ak', 'q-sign-time', 'q-key-time', 'q-signature', 'policy']
    if (!form || Object.keys(form).length !== fields.length || fields.some(k => typeof form[k] !== 'string')) throw Error('照片上传授权无效')
    const user = getApp().globalData.user
    if (!user || !Number.isInteger(user.id) || form.key !== `palm/staging/${user.id}/${metadata.ticket}`) throw Error('照片归属无效')
    const bounds = form['q-key-time'].split(';').map(Number)
    if (!within(bounds[0], bounds[1], 600, now) || bounds[1] !== value.expires_at || form['q-sign-time'] !== form['q-key-time']
        || form['q-sign-algorithm'] !== 'sha1' || !/^[a-f0-9]{40}$/.test(form['q-signature'])
        || form.acl !== 'default' || form.success_action_status !== '204'
        || !['image/jpeg', 'image/png', 'image/webp'].includes(form['Content-Type'])) throw Error('照片上传授权无效')
    const policy = decodeJSON(form.policy)
    if (Date.parse(policy.expiration) !== value.expires_at * 1000 || !Array.isArray(policy.conditions)) throw Error('照片授权有效期无效')
    for (const key of ['key', 'Content-Type', 'acl', 'success_action_status', 'q-sign-algorithm', 'q-ak', 'q-sign-time']) {
      if (!policy.conditions.some(c => c && c[key] === form[key])) throw Error('照片上传授权约束无效')
    }
    const size = policy.conditions.find(c => Array.isArray(c) && c[0] === 'content-length-range')
    if (!policy.conditions.some(c => c && c.bucket === BUCKET) || !size || !Number.isInteger(size[1])
        || size[1] <= 0 || size[1] !== size[2] || size[2] > MAX) throw Error('照片上传大小约束无效')
    return { ...metadata, upload_url: value.url, form }
  }
  if (!/^https:\/\//.test(value.url || '') || !/^[a-f0-9]{24}$/.test(metadata.version || '')) throw Error('照片下载授权无效')
  const match = value.url.match(/^https:\/\/([^/?#]+)(\/palm\/photos\/([a-f0-9]{32})(\.thumb)?\.jpg)\?([^#]+)$/)
  if (!match || match[1] !== HOST) throw Error('照片下载地址无效')
  const params = {}
  for (const pair of match[5].split('&')) {
    const index = pair.indexOf('=')
    if (index < 0) throw Error('照片下载签名无效')
    const key = decodeURIComponent(pair.slice(0, index)), val = decodeURIComponent(pair.slice(index + 1))
    if (Object.prototype.hasOwnProperty.call(params, key)) throw Error('照片下载签名无效')
    params[key] = val
  }
  const ends = []
  for (const key of ['q-sign-time', 'q-key-time']) {
    const [start, end, extra] = (params[key] || '').split(';').map(Number)
    if (extra !== undefined || !within(start, end, 300, now)) throw Error('照片下载授权已过期或无效')
    ends.push(end)
  }
  if (params['q-sign-algorithm'] !== 'sha1' || !/^[a-f0-9]{40}$/.test(params['q-signature'] || '')
      || Math.min(...ends) !== value.expires_at) throw Error('照片下载签名无效')
  return { ...metadata, url: value.url }
}
module.exports = { restore, HOST, BUCKET }
