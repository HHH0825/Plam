// Date and display helpers: cash calculations remain on the server.
const { today, money } = require('./ledger')
const { roundUnit } = require('./compact-money')

function calendarDate(month, day = 1) {
  const date = new Date(0)
  date.setUTCFullYear(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date
}
function monthLabel(month) { return month.slice(0, 4) + '年' + Number(month.slice(5)) + '月' }
function dayLabel(date) {
  return Number(date.slice(5, 7)) + '月' + Number(date.slice(8)) + '日 · 星期' +
    '日一二三四五六'[calendarDate(date.slice(0, 7), Number(date.slice(8))).getUTCDay()]
}
function positive(value) { return typeof value === 'string' && /^\d+\.\d{2}$/.test(value) && /[1-9]/.test(value) }
function trim(value) { return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') }
function amountCandidates(value) {
  if (!/^\d+\.\d{2}$/.test(value || '')) return []
  const [integer, fraction] = value.split('.')
  const digits = integer.replace(/^0+(?=\d)/, '') + fraction
  const results = [trim(value)]
  for (const power of integer.length >= 9 ? [8] : [4, 8]) {
    for (const precision of [2, 1, 0]) {
      let scaled = roundUnit(digits, power + 2 - precision)
      // roundUnit always places two decimal digits; reinterpret the rounded integer.
      let units = scaled.replace('.', '').replace(/^0+(?=\d)/, '')
      const padded = units.padStart(precision + 1, '0')
      let text = precision ? padded.slice(0, -precision) + '.' + padded.slice(-precision) : padded
      text = trim(text)
      if (!/[1-9]/.test(text)) continue
      if (power === 4 && text.split('.')[0].length >= 5) continue
      results.push(text + (power === 8 ? '亿' : '万'))
    }
  }
  return [...new Set(results)]
}
function compactAmount(value, width = 34, digitWidth = 6, unitWidth = 11) {
  const candidates = amountCandidates(value)
  const measure = text => [...text].reduce((n, c) => n + (/[万亿]/.test(c) ? unitWidth : c === '.' ? digitWidth / 2 : digitWidth), 0)
  // Prefer standard 万/亿 units once the amount reaches that magnitude.
  const whole = String(value).split('.')[0]
  const preferred = whole.length >= 5 ? candidates.filter(x => /[万亿]/.test(x)) : candidates
  return preferred.find(x => measure(x) <= width) || preferred.reduce((shortest, x) =>
    !shortest || measure(x) < measure(shortest) ? x : shortest, '') || candidates[0] || ''
}
function chooseDate(month, days, selected, now = today()) {
  const last = calendarDate(month, 1); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0)
  if (selected && selected.startsWith(month + '-') && selected <= now &&
      /^\d{4}-\d{2}-\d{2}$/.test(selected) && Number(selected.slice(8)) >= 1 && Number(selected.slice(8)) <= last.getUTCDate()) return selected
  if (month === now.slice(0, 7)) return now
  const recorded = days.filter(x => x.count > 0 && x.date <= now).map(x => x.date).sort()
  return recorded[recorded.length - 1] || month + '-01'
}
function cells(month, days, selected, now = today(), metrics = {}) {
  metrics = metrics || {}
  const first = calendarDate(month), offset = (first.getUTCDay() + 6) % 7
  const last = calendarDate(month, 1); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0)
  const count = last.getUTCDate(), length = Math.ceil((offset + count) / 7) * 7
  const byDate = Object.fromEntries(days.map(x => [x.date, x]))
  return Array.from({ length }, (_, i) => {
    const day = i - offset + 1
    if (day < 1 || day > count) return { key: 'blank-' + i, blank: true }
    const date = month + '-' + String(day).padStart(2, '0'), entry = byDate[date] || {}
    const display = value => compactAmount(value, metrics.width, metrics.digitWidth, metrics.unitWidth)
    return { key: date, date, day, blank: false, future: date > now, today: date === now,
      selected: date === selected, weekend: i % 7 >= 5, refund: date <= now && positive(entry.refund),
      expense: date <= now && positive(entry.gross_expense) ? display(entry.gross_expense) : '',
      income: date <= now && positive(entry.income) ? display(entry.income) : '' }
  })
}
function exactDay(days, date) {
  const day = days.find(x => x.date === date)
  return day ? { ...day, grossText: money(day.gross_expense), incomeText: money(day.income),
    refundText: money(day.refund), hasRefund: positive(day.refund) } : null
}
function panelLayout(width, probes, secondaryWidth, options = {}) {
  const sizes = options.mainSizes || [32, 30, 28], small = options.smallSizes || [20, 18, 16]
  const mainSize = sizes.find(s => probes['main-' + s]?.width <= width) || sizes[sizes.length - 1]
  const column = (secondaryWidth - 13) / 2
  const smallSize = small.find(s => ['income', 'net'].every(k => probes[k + '-' + s]?.width <= column))
  return { mainSize, smallSize: smallSize || small[0], stacked: !smallSize }
}
module.exports = { calendarDate, monthLabel, dayLabel, positive, amountCandidates, compactAmount,
  chooseDate, cells, exactDay, panelLayout }
