const covers = require('./item-covers')
const priorities = ['warranty_due', 'manual_idle', 'inactive', 'warranty_expired', 'unknown_use', 'repair_leader', 'purchase_yoy', 'digital_share']
const art = { warranty_due:'type-tools', warranty_expired:'type-tools', manual_idle:'cat-book', inactive:'cat-search', unknown_use:'type-books', repair_leader:'type-tools', purchase_yoy:'type-daily', digital_share:'type-digital' }

function readStats(stats) {
  const amounts = ['net_cost_total', 'purchase_total', 'maintenance_total', 'disposal_total']
  if (!stats || !Number.isSafeInteger(stats.total_items) || stats.total_items < 0 ||
      !amounts.every(key => typeof stats[key] === 'string' && /^-?\d+\.\d{2}$/.test(stats[key]))) {
    throw new Error('统计数据格式异常，请重试')
  }
  return { ...stats, breakdown: [['purchase_total','购买支出'],['maintenance_total','维修支出'],['fixed_expense_total','关联订阅／分期'],['disposal_total','处置回收']].map(([key,label]) => ({key,label,text:typeof stats[key] === 'string' && /^-?\d+\.\d{2}$/.test(stats[key]) ? '¥'+stats[key] : '暂不可用'})) }
}

function readCards(insights) {
  if (!insights || !Array.isArray(insights.analysis_cards)) throw new Error('分析数据格式异常，请重试')
  const seen = new Map()
  return insights.analysis_cards.map((card, index) => {
    if (!card || !['kind', 'label', 'headline', 'explanation'].every(key => typeof card[key] === 'string') ||
        !Array.isArray(card.items) || !card.items.every(item => item && Number.isSafeInteger(item.id) &&
          item.id > 0 && typeof item.name === 'string')) throw new Error('分析数据格式异常，请重试')
    const base = card.kind+':'+card.items.map(item=>item.id).join(','), occurrence = seen.get(base)||0
    seen.set(base,occurrence+1)
    const items = card.items.map(item => ({ ...item, art: covers.fallback(item) }))
    return { ...card, key:base+':'+occurrence, order:index, art:'/assets/white-doodle/'+(art[card.kind]||'cat-search')+'.png', items, shownItems:items.slice(0,3), basisOpen:false, itemsOpen:false }
  }).sort((a,b) => {
    const rank = kind => priorities.includes(kind) ? priorities.indexOf(kind) : priorities.length
    return rank(a.kind)-rank(b.kind)||a.order-b.order
  })
}

module.exports = { readStats, readCards }
