const { filterItems, TYPE_OPTIONS } = require('./view')
const SORTS = ['最近添加', '持有最久', '购买价格从高到低', '净成本/天从高到低', '净成本/天从低到高']
function select(items, query, status, category, sort = 0) {
  return filterItems(items, query, status).filter(i => !category || i.category === category).sort((a, b) => {
    const pin = Number(!!b.is_pinned) - Number(!!a.is_pinned)
    if (pin) return pin
    const key = [null, 'holding_days', 'purchase_price', 'daily_net_cost', 'daily_net_cost'][sort]
    if (key) {
      if (a[key] == null && b[key] != null) return 1
      if (b[key] == null && a[key] != null) return -1
      const difference = sort === 4 ? Number(a[key]) - Number(b[key]) : Number(b[key]) - Number(a[key])
      if (difference) return difference
    }
    return b.id - a.id
  })
}
function art(type) { return require('./item-covers').art(typeof type === 'object' ? type : {icon_type:type}) }
function inScope(items, scope = 'held') {
  return items.filter(item => !item.deleted_at && !item.is_deleted && (scope === 'disposed' ? item.status === 'disposed' : ['active', 'idle'].includes(item.status)))
}
function preferenceKey(user, scope) { return (scope === 'disposed' ? 'wwjDisposedCollection:' : 'wwjCollection:') + user.id }
function preferences(user, scope = 'held') {
  let s
  try { s = user && user.id && wx.getStorageSync(preferenceKey(user, scope)) } catch (_) {}
  return { layout: 'list',
    sortIndex: s && Number.isInteger(s.sortIndex) && s.sortIndex >= 0 && s.sortIndex < SORTS.length ? s.sortIndex : 0 }
}
function savePreferences(user, data, scope = 'held') {
  try { if (user && user.id) wx.setStorageSync(preferenceKey(user, scope), { layout: data.layout, sortIndex: data.sortIndex }) } catch (_) {}
}
module.exports = { SORTS, select, inScope, art, preferences, savePreferences }
