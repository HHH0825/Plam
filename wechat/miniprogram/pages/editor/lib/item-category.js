const { TYPE_OPTIONS } = require('../../../utils/view')
const config = require('../../../config')
const { serviceScope } = require('../../../utils/cloud-transport')

function normalize(form) {
  const option = TYPE_OPTIONS.find(row => row[0] === form.icon_type) || TYPE_OPTIONS[8]
  return { ...form, icon_type: option[0], category: option[1] }
}
function index(form) { return TYPE_OPTIONS.findIndex(row => row[0] === normalize(form).icon_type) }
function stable(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}'
}
// A category-only conversion must not create a second receipt for an unknown old write.
function submission(payload, { method, path, revision, photoSnapshot }) {
  const matches = body => body && typeof body === 'object' && stable(normalize(body)) === stable(normalize(payload))
  if (photoSnapshot) {
    const original = JSON.parse(photoSnapshot)
    if (matches(original)) return { payload: original, legacyCategory: original.category !== payload.category }
  }
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return { payload, legacyCategory: false }
  const user = getApp().globalData.user
  if (!user?.id) return { payload, legacyCategory: false }
  const cloud = ['cloud_function', 'cloud_http_function'].includes(config.API_TRANSPORT)
  const key = `${cloud ? 'palmRequests' : 'palmLocalRequests'}:${serviceScope()}:${user.id}`
  const stored = wx.getStorageSync(key)
  const rows = cloud ? stored?.version === 1 && stored.rows || {} : stored || {}
  const candidates = Object.keys(rows).flatMap(fingerprint => {
    try {
      const [verb, route, body, version] = JSON.parse(fingerprint)
      return verb === method && route === path && (version ?? null) === (revision ?? null) && matches(body) ? [body] : []
    } catch (_) { return [] }
  })
  if (candidates.length > 1) throw Error('存在多个未确认的原提交，请先核对云端物品，避免重复建档。')
  const original = candidates[0] || payload
  return { payload: original, legacyCategory: original.category !== payload.category }
}
module.exports = { normalize, index, submission }
