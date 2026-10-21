function readMonthly(data) {
  const money = value => typeof value === 'string' && /^\d+\.\d{2}$/.test(value)
  const count = value => Number.isSafeInteger(value) && value >= 0
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!data || !/^\d{4}-\d{2}$/.test(data.month) || !day(data.today) || !day(data.cutoff_date) ||
      typeof data.is_current !== 'boolean' || typeof data.has_activity !== 'boolean' || !data.totals ||
      !count(data.totals.purchase_count) || typeof data.totals.cashflow_net !== 'string' || !/^-?\d+\.\d{2}$/.test(data.totals.cashflow_net) ||
      !['purchase_total', 'maintenance_total', 'disposal_total'].every(k => money(data.totals[k])) ||
      !['fixed_expense_total', 'installment_principal_total'].every(k => data.totals[k] == null || money(data.totals[k])) ||
      !Array.isArray(data.purchases) || !data.purchases.every(i => i && count(i.id) && i.id > 0 && typeof i.name === 'string' && day(i.purchase_date) && money(i.purchase_price)) ||
      !Array.isArray(data.memories) || !data.memories.every(i => i && typeof i.key === 'string' && count(i.item_id) && i.item_id > 0 && typeof i.name === 'string' && typeof i.label === 'string' && day(i.date)) ||
      !Array.isArray(data.purchase_leaders) || !data.purchase_leaders.every(i => i && count(i.id) && i.id > 0 && typeof i.name === 'string' && money(i.purchase_price) &&
        (i.share === null || typeof i.share === 'string' && /^\d+\.\d{2}$/.test(i.share) && Number(i.share) <= 100))) {
    throw new Error('月度数据格式异常，请重试')
  }
  return data
}
const { PALETTE, money, pageStyle: reportPageStyle, VERSION: REPORT_DESIGN_VERSION } = require('./report-design')
const CASHFLOW_SCOPE = '仅比较当月物品相关记录；分期本金另列，不计入上述净额。'
function presentCashflow(value, hasActivity) {
  // Keep decimal precision: only inspect the sign, never convert money to Number.
  const unsigned = value.replace(/^-/, '')
  const zero = /^0+\.00$/.test(unsigned)
  const recovered = !zero && value.startsWith('-')
  return {
    label: !hasActivity ? '本月暂无收支' : zero ? '本月收支持平' : recovered ? '本月净回收' : '本月净支出',
    amount: money(zero ? '0.00' : unsigned),
    empty: !hasActivity,
    note: !hasActivity ? '' : zero ? '本月支出与处置回收相同' : recovered ? '本月处置回收超过支出' : '本月支出超过处置回收'
  }
}
function presentMonthly(report, icons = {}) {
  const totals = { fixed_expense_total:'0.00', installment_principal_total:'0.00', ...report.totals }
  const balance = presentCashflow(totals.cashflow_net, report.has_activity)
  const definitions = [['purchase_total', '购置支出', PALETTE.sage], ['maintenance_total', '维修支出', PALETTE.maintenance], ['fixed_expense_total', '订阅/分期支出', PALETTE.maintenance], ['disposal_total', '处置回收', PALETTE.rose]]
  const max = Math.max(...definitions.map(([key]) => Number(totals[key])))
  const bars = definitions.map(([key, label, color]) => ({ key, label, amount: money(totals[key]), color,
    // Ratios are visual only. Monetary totals are calculated in integer cents by the backend.
    width: max ? Number(totals[key]) / max * 100 : 0 }))
  const leaders = report.purchase_leaders
  let finding = ''
  if (leaders.length) {
    if (Number(totals.purchase_total) === 0) finding = '本月购入物品的记录价格均为 ¥0.00。'
    else finding = leaders.length === 1 ? `${leaders[0].name} 是本月购入金额最高的物品。` : `${leaders.map(i => i.name).join('、')} 并列本月购入金额最高。`
  }
  const share = leaders.length && leaders[0].share != null ? leaders[0].share : null
  return {
    monthNumber: report.month.slice(5), year: report.month.slice(0, 4), monthArt: '/assets/white-doodle/month-' + report.month.slice(5) + '.png',
    monthEdition: report.month.slice(0, 4) + ' · ' + ['一','二','三','四','五','六','七','八','九','十','十一','十二'][Number(report.month.slice(5)) - 1] + '月刊',
    totalsText: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, key === 'purchase_count' ? value : money(value)])),
    bars, finding, findingBasis: leaders.length && Number(totals.purchase_total) > 0 ?
      `${leaders.length > 1 ? '每件' : '该物品'}购入金额 ¥${money(leaders[0].purchase_price)} ÷ 本月购置支出 ¥${money(totals.purchase_total)}${share != null ? ' = ' + share + '%' : ''}。` : '',
    findingArt: icons[leaders[0]?.id] || require('./collection').art(report.purchases.find(item => leaders[0] && item.id === leaders[0].id) || {}),
    findingFallback: require('./item-covers').fallback(report.purchases.find(item => leaders[0] && item.id === leaders[0].id) || {}),
    balance, cashflowNote: balance.note, cashflowScope: CASHFLOW_SCOPE,
    purchases: report.purchases.map(item => ({ ...item, priceText: money(item.purchase_price), art: icons[item.id] || require('./collection').art(item), fallbackArt: require('./item-covers').fallback(item) })),
    memories: []
  }
}
// Measure native canvas text; use an ellipsis only when the reserved line count is exhausted.
function wrapLines(context, text, width, maxLines) {
  const tokens = (String(text).replace(/\s+/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9.,/:%_-]*|[^\s]| +/g) || [])
    .flatMap(token => context.measureText(token).width > width ? Array.from(token) : [token])
  const lines = []
  let line = ''
  for (let index = 0; index < tokens.length; index++) {
    let token = tokens[index]
    const next = line + token
    if (context.measureText(next).width > width && line) {
      // Keep dates/amounts together where possible and avoid an isolated Chinese closing mark.
      if (/^[，。！？；：、）】》%]$/.test(token) || /[（【《]$/.test(line)) {
        const trailing = line.match(/[A-Za-z0-9][A-Za-z0-9.,/:%_-]*$/)
        const previous = trailing && context.measureText(trailing[0] + token).width <= width ? trailing[0] : Array.from(line).pop()
        line = line.slice(0, -previous.length); token = previous + token
      }
      if (line.trim()) lines.push(line.trimEnd())
      line = ''
      if (lines.length === maxLines) {
        let last = lines.pop()
        while (last && context.measureText(last + '…').width > width) last = Array.from(last).slice(0, -1).join('')
        lines.push(last + '…'); return lines
      }
    }
    line += line ? token : token.trimStart()
  }
  if (line.trim()) lines.push(line.trimEnd())
  return lines
}
module.exports = { readMonthly, wrapLines, presentMonthly, presentCashflow, PALETTE, reportPageStyle, REPORT_DESIGN_VERSION }
