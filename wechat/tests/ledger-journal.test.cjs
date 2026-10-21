const test = require('node:test'), assert = require('node:assert/strict')
const ledger = require('../miniprogram/utils/ledger'), calendar = require('../miniprogram/utils/ledger-calendar')
const api = require('../miniprogram/utils/api')
const tick = () => new Promise(r => setImmediate(r))
function harness(stats = false) {
  const original = api.request, calls = [], app = { globalData: { token: 'A', user: { id: 1 } }, requireSession: () => true }
  const bar = { hidden: false, sync() { this.hidden = page.data.filterOpen } }
  global.getApp = () => app; global.wx = { hideKeyboard() {}, showModal() {}, nextTick: f => f(), pageScrollTo: x => calls.push(x) }
  const definition = ledger.tabPage(stats)
  const page = { ...definition, data: structuredClone(definition.data), getTabBar: () => bar,
    setData(patch, cb) { Object.assign(this.data, patch); cb?.() } }
  page.onLoad(); page._visible = true; page.setData({ month: '2025-01', enabled: true, supported: true })
  api.request = async (url) => { calls.push(url); return {} }
  return { page, app, calls, bar, restore() { page.onUnload(); api.request = original } }
}
const totals = { gross_expense: '28.00', expense: '28.00', income: '80.00', refund: '0.00', net: '52.00', count: 2 }

test('rereading statistics retries a failed ring even when the chart data is unchanged', async () => {
  const h = harness(true), raw = require('./fixtures/cash-redesign.cjs').stats
  try {
    let retries = 0
    h.page.setData({ month: '2026-10' })
    h.page.selectComponent = selector => selector === '.cash-analysis-ring' ? { draw() { retries++ } } : null
    api.request = async () => raw
    await h.page.fetch(true); await h.page.fetch(true)
    assert.equal(retries, 2)
    h.app.globalData.token = 'B'
    await h.page.fetch(true)
    assert.equal(retries, 2)
  } finally { h.restore() }
})
test('Monday-first calendar covers all month lengths, leap years, six weeks and the year boundary', () => {
  for (const [month, days, rows] of [['2026-02', 28, 5], ['2021-02', 28, 4], ['2024-02', 29, 5], ['2026-04', 30, 5], ['2026-08', 31, 6], ['2026-10', 31, 5]]) {
    const cells = calendar.cells(month, [], '', '2027-01-01')
    assert.equal(cells.length, rows * 7); assert.deepEqual(cells.filter(x => !x.blank).map(x => x.day), Array.from({ length: days }, (_, i) => i + 1))
  }
  assert.equal(calendar.cells('2026-10', [], '', '2026-10-13')[3].day, 1)
  assert.equal(calendar.dayLabel('2026-10-13'), '10月13日 · 星期二')
  assert.equal(ledger.moveMonth('2026-12', 1), '2027-01'); assert.equal(ledger.moveMonth('0099-12', 1), '0100-01')
})
test('date selection, future records, refund markers and blank days are explicit', () => {
  const days = [{ date: '2026-10-12', ...totals, count: 1, refund: '50.00' }, { date: '2026-10-13', ...totals }, { date: '2026-10-14', ...totals }]
  assert.equal(calendar.chooseDate('2026-10', days, '', '2026-10-13'), '2026-10-13')
  assert.equal(calendar.chooseDate('2026-10', days, '2026-10-12', '2026-10-13'), '2026-10-12')
  assert.equal(calendar.chooseDate('2026-10', days, '', '2026-11-01'), '2026-10-14')
  assert.equal(calendar.chooseDate('2026-09', [], '', '2026-10-13'), '2026-09-01')
  const cells = calendar.cells('2026-10', days, '2026-10-13', '2026-10-13')
  assert.equal(cells.find(x => x.day === 12).refund, true)
  assert.equal(cells.find(x => x.day === 13).selected, true)
  assert.equal(cells.find(x => x.day === 14).income, '')
  assert.equal(cells.find(x => x.day === 14).future, true)
  assert.equal(cells.find(x => x.day === 1).expense, '')
})
test('calendar compact decimals round without floating point, promote units and preserve exact values', () => {
  assert.equal(calendar.compactAmount('46.50', 40), '46.5')
  assert.equal(calendar.compactAmount('10000.00', 40), '1万')
  assert.equal(calendar.compactAmount('17551.90', 40), '1.76万')
  assert.equal(calendar.compactAmount('17551.90', 28), '1.8万')
  assert.equal(calendar.compactAmount('99999950.00', 40), '1亿')
  assert.equal(calendar.compactAmount('900719925474099350000.00', 120), '9007199254740.99亿')
  assert.equal(calendar.exactDay([{ date: '2025-01-01', ...totals, gross_expense: '900719925474099350000.01' }], '2025-01-01').grossText, '900,719,925,474,099,350,000.01')
})
test('filter cancellation and reset do not change applied conditions; search invalidates old work immediately', () => {
  const h = harness(); try {
    const p = h.page; p.setData({ kindIndex: 1, query: '午餐' }); p.openFilter(); assert.equal(h.bar.hidden, true)
    p.filter({ currentTarget: { dataset: { key: 'kindIndex' } }, detail: { value: 2 } }); p.closeFilter()
    assert.equal(p.data.kindIndex, 1); assert.equal(h.bar.hidden, false)
    p.openFilter(); p.clearFilter(); assert.equal(p.data.kindIndex, 1)
    let loads = 0; p.load = () => loads++; p.applyFilter(); assert.equal(p.data.kindIndex, 0); assert.equal(loads, 1); assert.equal(p.data.query, '午餐')
    const sequence = p._sequence; p.search({ detail: { value: '键盘' } }); assert.equal(p._sequence, sequence + 1)
    p.toggleSearch(); assert.equal(p.data.searchFocus, true); p.toggleSearch(); assert.equal(p.data.query, '键盘')
  } finally { h.restore() }
})
test('day totals use server complete results rather than the loaded rows', () => {
  const groups = ledger.groups([{ id: 'a', occurred_on: '2025-01-13', amount: '1.00', kind: 'expense' }], { '2025-01-13': { ...totals, gross_expense: '500.00', count: 500 } })
  assert.equal(groups[0].totals.grossText, '500.00'); assert.equal(groups[0].entries.length, 1)
  assert.equal(ledger.groups([{ occurred_on: '2025-01-13', amount: '1.00' }])[0].totals, null)
})
test('late day responses cannot replace a new date, and pagination remains date scoped', async () => {
  const h = harness(true); try {
    const p = h.page; p.setData({ selectedDate: '2025-01-13', days: [{ date: '2025-01-13', ...totals }, { date: '2025-01-12', ...totals }] })
    const waiting = []; api.request = url => new Promise(resolve => waiting.push({ url, resolve }))
    const old = p.loadDay(); p.selectDay({ currentTarget: { dataset: { date: '2025-01-12' } } })
    waiting[1].resolve({ date: '2025-01-12', entries: [{ id: 'b', occurred_on: '2025-01-12', amount: '28.00' }], next_offset: 30 }); await tick()
    waiting[0].resolve({ date: '2025-01-13', entries: [{ id: 'a', occurred_on: '2025-01-13', amount: '28.00' }], next_offset: null }); await old
    assert.equal(p.data.dayEntries[0].id, 'b'); assert.equal(p.data.dayNextOffset, 30)
    const more = p.loadDay(true); assert.match(waiting[2].url, /date=2025-01-12&offset=30/)
    waiting[2].resolve({ date: '2025-01-12', entries: [{ id: 'c', occurred_on: '2025-01-12', amount: '1.00' }], next_offset: null }); await more
    assert.deepEqual(p.data.dayEntries.map(x => x.id), ['b', 'c'])
  } finally { h.restore() }
})
test('old server without a date echo cannot show a month as one day', async () => {
  const h = harness(true); try {
    h.page.setData({ selectedDate: '2025-01-13' }); api.request = async () => ({ entries: [{ id: 'wrong-day' }], next_offset: null })
    await h.page.loadDay(); assert.equal(h.page.data.daySupported, false); assert.deepEqual(h.page.data.dayEntries, []); assert.match(h.page.data.dayError, /新版服务端/)
  } finally { h.restore() }
})
test('day failure preserves actual summary, account change and hiding reject pending data', async () => {
  const h = harness(true); try {
    const p = h.page; p.setData({ selectedDate: '2025-01-13', selectedDay: totals }); api.request = async () => { throw Error('offline') }
    await p.loadDay(); assert.match(p.data.dayError, /offline/); assert.equal(p.data.selectedDay.gross_expense, '28.00')
    let resolve; api.request = () => new Promise(r => resolve = r); const request = p.loadDay(); p.onHide(); h.app.globalData.token = 'B'
    resolve({ date: '2025-01-13', entries: [{ id: 'old-owner', occurred_on: '2025-01-13' }] }); await request
    assert.deepEqual(p.data.dayEntries, [])
    p.load = () => {}; p.onShow(); assert.equal(p.data.selectedDate, ''); assert.equal(p.data.query, ''); assert.equal(p.data.selectedDay, null)
  } finally { h.restore() }
})
test('calendar and panel measurements reject stale callbacks and select a fitting layout', () => {
  assert.deepEqual(calendar.panelLayout(300, { 'main-32': { width: 310 }, 'main-30': { width: 280 }, 'income-20': { width: 180 }, 'net-20': { width: 160 }, 'income-18': { width: 130 }, 'net-18': { width: 120 } }, 300), { mainSize: 30, smallSize: 18, stacked: false })
  const h = harness(true); try {
    const p = h.page; p.setData({ calendarCells: [{}], days: [], selectedDate: '2025-01-13' }); let callback
    wx.createSelectorQuery = () => ({ in() { return this }, select() { return this }, boundingClientRect() { return this }, exec(cb) { callback = cb } })
    p.measure(); p._sequence++; callback([{ width: 44 }, { width: 60 }, { width: 11 }]); assert.equal(p._calendarMetrics, undefined)
  } finally { h.restore() }
})

test('midnight follows today across a month boundary and return scroll rejects obsolete work', () => {
  const h = harness(true), originalToday = ledger.today
  try {
    const p = h.page; ledger.today = () => '2026-10-31'; p.tickDay()
    p.setData({ month: '2026-10', selectedDate: '2026-10-31' }); ledger.today = () => '2026-11-01'
    assert.equal(p.tickDay(), true); assert.equal(p.data.month, '2026-11'); assert.equal(p.data.selectedDate, '2026-11-01')
    assert.equal(p.tickDay(), false)
    p.setData({ selectedDate: '2026-10-12' }); ledger.today = () => '2026-11-02'
    p.tickDay(); assert.equal(p.data.selectedDate, '2026-10-12')
    p._scroll = 360; p.onHide(); p._visible = true
    let ready; wx.nextTick = f => ready = f; p.restoreScroll(); p._sequence++; ready()
    assert.equal(h.calls.filter(x => typeof x === 'object').length, 0)
    p._returnScroll = 360; p.restoreScroll(); ready(); assert.deepEqual(h.calls.at(-1), { scrollTop: 360, duration: 0 })
  } finally { ledger.today = originalToday; h.restore() }
})

test('month races and malformed daily responses cannot replace valid current data', async () => {
  const h = harness(true)
  try {
    const p = h.page, waiting = []; api.request = url => new Promise(resolve => waiting.push({ url, resolve }))
    const old = p.fetch(true); p._sequence++; p.setData({ month: '2025-02' }); const fresh = p.fetch(true)
    waiting[1].resolve({ summary: totals, days: [{ date: '2025-02-12', ...totals }], categories: [] }); await fresh
    waiting[0].resolve({ summary: { ...totals, income: '999.00' }, days: [], categories: [] }); await old
    assert.equal(p.data.summary.incomeText, '80.00'); assert.equal(p.data.selectedDate, '2025-02-12')
    api.request = async () => ({ date: '2025-02-12', entries: [{ occurred_on: '2025-02-13' }], next_offset: null })
    await p.loadDay(); assert.match(p.data.dayError, /返回异常/); assert.deepEqual(p.data.dayEntries, [])
    api.request = async () => ({ summary: totals })
    await assert.rejects(p.fetch(true), /数据返回不完整/)
  } finally { h.restore() }
})
