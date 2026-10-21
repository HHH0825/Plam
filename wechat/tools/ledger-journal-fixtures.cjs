const ledger = require('../miniprogram/utils/ledger'), cal = require('../miniprogram/utils/ledger-calendar')
const source = [
 ['2026-10-13', '午餐', 'expense', 'food', '28.00'],
 ['2026-10-13', '地铁', 'expense', 'transport', '18.00'],
 ['2026-10-13', '收到红包', 'income', 'gift', '80.00'],
 ['2026-10-12', '耳机部分退款', 'refund', 'shopping', '50.00'],
 ['2026-10-12', '咖啡', 'expense', 'food', '16.00'],
 ['2026-10-10', '晚餐', 'expense', 'food', '46.50'],
 ['2026-10-08', '耳机', 'expense', 'shopping', '1050.00'],
 ['2026-10-06', '房租', 'expense', 'home', '1200.00'],
 ['2026-10-05', '十月工资', 'income', 'salary', '6420.00'],
 ['2026-10-02', '电影', 'expense', 'fun', '60.00']
]
const entries = source.map(([occurred_on, name, kind, category, amount], i) => ({ id: (i + 1).toString(16).padStart(32, '0'),
  occurred_on, name, kind, category, amount, category_name: [...ledger.expense, ...ledger.income].find(c => c[0] === category)[1],
  source: kind === 'refund' ? 'refund' : 'manual', source_name: kind === 'refund' ? '关联退款' : '手动记账',
  state: 'active', revision: 1, editable: true, item_id: null, item_name: '', notes: '', refunds: [], changes: [], refunded: '0.00' }))
function total(rows) {
  const sum = kind => rows.filter(x => x.kind === kind).reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0)
  const gross = sum('expense'), income = sum('income'), refund = sum('refund'), net = income + refund - gross
  return { count: rows.length, gross_expense: (gross / 100).toFixed(2), income: (income / 100).toFixed(2),
    refund: (refund / 100).toFixed(2), expense: (Math.abs(gross - refund) / 100).toFixed(2),
    expense_label: gross >= refund ? '本月支出' : '本月退款结余', net: (Math.abs(net) / 100).toFixed(2),
    net_label: net > 0 ? '本月净收入' : net < 0 ? '本月净支出' : '本月收支持平' }
}
const summary = total(entries)
const days = Array.from({ length: 31 }, (_, i) => { const date = '2026-10-' + String(i + 1).padStart(2, '0'); return { date, ...total(entries.filter(x => x.occurred_on === date)) } })
const day_summaries = Object.fromEntries(days.filter(x => x.count).map(x => [x.date, x]))
const categories = [...new Set(entries.filter(x => x.kind !== 'income').map(x => x.category))].map(key => ({ key,
  name: ledger.expense.find(x => x[0] === key)[1], ...total(entries.filter(x => x.category === key && x.kind !== 'income')) }))
categories.sort((a, b) => Number(b.gross_expense) - Number(b.refund) - Number(a.gross_expense) + Number(a.refund))
const stats = { summary, days, categories }
function patch(name) {
  const base = { loading: false, error: '', enabled: true, supported: true, summary: ledger.summary(summary), month: '2026-10', monthLabel: '2026年10月', maxMonth: '2026-10', canNext: false }
  if (name === 'ledger') return { ...base, entries, groups: ledger.groups(entries, day_summaries), nextOffset: null }
  return { ...base, days, selectedDate: '2026-10-13', selectedLabel: cal.dayLabel('2026-10-13'),
    selectedDay: cal.exactDay(days, '2026-10-13'), calendarCells: cal.cells('2026-10', days, '2026-10-13', '2026-10-13'),
    dayEntries: entries.filter(x => x.occurred_on === '2026-10-13').map(ledger.row), dayNextOffset: null,
    categories: categories.map(x => ({ ...x, expenseText: ledger.money(x.expense), grossText: ledger.money(x.gross_expense),
      refundText: ledger.money(x.refund), percent: (Number(x.gross_expense) - Number(x.refund)) / 12, refundSurplus: x.expense_label === '本月退款结余' })) }
}
module.exports = { entries, summary, stats, day_summaries, total, patch }
