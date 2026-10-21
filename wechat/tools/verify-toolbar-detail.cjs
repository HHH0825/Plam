// Actual templates/styles and the actual entry measurement method; fixtures never reach an account.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { pathToFileURL } = require('node:url'), { chromium } = require('playwright')
const root = path.resolve(__dirname, '../miniprogram'), output = path.resolve(__dirname, '../docs/images/toolbar-detail-20261011')
const scratch = path.resolve(__dirname, '../.qa-locations'), read = file => fs.readFileSync(path.join(root, file), 'utf8')
const base = pathToFileURL(root).href, tabs = JSON.parse(read('app.json')).tabBar
const item = { id: 990001, name: '每天陪我的水杯', category: '日常用品', status: 'active', statusText: '使用中', purchase_date: '2026-06-07', purchase_price: '19.90', holding_days: 126, dailyPurchase: '¥0.16', dailyNet: '¥0.16', net_cost: '19.90', maintenance_total: '0.00', disposal_proceeds: '0.00', art: '/assets/white-doodle/type-daily.png', icon: '☕', storage_location_name: '书桌抽屉' }
const frames = ['corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'edge-top', 'edge-bottom', 'edge-left', 'edge-right']
const common = { loading: false, error: '', item, busy: false, photoPath: '', photoLoading: false, photoError: false, photoUnavailable: false, costDecorError: false, costFrameParts: frames, artFailed: false, factsExpanded: false, timeline: [], allTimeline: [], historyUsage: [], historyExpanded: false }
const list = { ...common, items: [item], shown: [item], query: '', status: '', category: '', sortIndex: 0, sortLabels: ['最近添加', '持有最久', '价格 ↓', '净成本/天 ↓'], sortOptions: ['最近添加', '持有最久', '价格 ↓', '净成本/天 ↓'], photoPaths: {}, photoStates: {}, artErrors: {}, entryIconErrors: {}, decorError: false, entriesStacked: false, filterCount: 0, filterOpen: false }
let definition, rectangles
const wx = { createSelectorQuery() { return { in() { return this }, select() { return this }, selectAll() { return this }, boundingClientRect() { return this }, exec(done) { done(rectangles) } } } }
vm.runInNewContext(read('pages/items/index.js'), { require: () => ({}), Page: value => { definition = value }, wx })
function stylesheet(file, seen = new Set()) {
  if (seen.has(file)) return ''; seen.add(file)
  return read(file).replace(/@import\s+["']([^"']+)["'];/g, (_, ref) => stylesheet(path.posix.normalize(path.posix.join(path.posix.dirname(file), ref)), seen))
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(scratch, { recursive: true })
  const html = path.join(scratch, 'toolbar-detail.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><body></body>')
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--allow-file-access-from-files'] })
  const checks = []
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); await page.goto(pathToFileURL(html).href)
    const renderer = fs.readFileSync(path.join(__dirname, 'verify-item-doodle.cjs'), 'utf8'), begin = renderer.indexOf('    await page.evaluate(() => {'), end = renderer.indexOf("    await require('./white-nav-preview.cjs')", begin)
    await new (Object.getPrototypeOf(async function () {}).constructor)('page', renderer.slice(begin, end))(page)
    await require('./white-nav-preview.cjs')(page, root)
    async function capture(kind, width, name, patch = {}) {
      await page.setViewportSize({ width, height: 844 })
      const template = read(`pages/${kind}/index.wxml`).replace(/<(view|block|input)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g, '<$1$2></$1>').replace(/\b(view|block|picker|scroll-view)(?=[\s>])/g, 'div').replace(/\btext(?=[\s>])/g, 'span').replace(/\bimage(?=[\s>])/g, 'img')
      const css = (stylesheet('app.wxss') + stylesheet(`pages/${kind}/index.wxss`)).replace(/(?<![.\w-])page\s*\{/g, 'body {').replace(/(?<![.\w-])view\b/g, 'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g, 'span').replace(/(?<![.\w-])image\b/g, 'img').replace(/url\(['"]?\/assets\//g, "url('" + base + '/assets/')
      await page.evaluate(({ template, css, data, base, tabs, kind, large }) => {
        render(template, css, data, base, tabs)
        document.querySelectorAll('[disabled="false"]').forEach(n => n.removeAttribute('disabled'))
        if (kind === 'item') document.querySelector('.tab-bar')?.remove()
        if (large) [...document.querySelectorAll('.page *')].map(n => [n, parseFloat(getComputedStyle(n).fontSize)]).forEach(([n, size]) => { n.style.fontSize = size * 1.3 + 'px' })
      }, { template, css, data: { ...(kind === 'items' ? list : common), ...patch }, base, tabs, kind, large: patch.largeFont })
      if (kind === 'items') {
        rectangles = await page.evaluate(() => [document.querySelector('.purchase-entries').getBoundingClientRect().toJSON(), [...document.querySelectorAll('.purchase-entry-label')].map(n => n.getBoundingClientRect().toJSON())])
        let stacked = false
        definition.measureEntryLayout.call({ _visible: true, data: { entriesStacked: false }, setData(data) { stacked = data.entriesStacked } })
        await page.evaluate(stacked => document.querySelector('.purchase-entries').classList.toggle('entries-stacked', stacked), stacked)
      }
      await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? Promise.resolve() : new Promise(resolve => { i.onload = resolve; i.onerror = resolve }))))
      const result = await page.evaluate(({ kind, width, large, fallback }) => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON()
        const result = { overflow: document.documentElement.scrollWidth > innerWidth, width, kind }
        if (kind === 'items') {
          result.entries = ['.wishlist-entry', '.subscription-entry', '.storage-entry'].map(rect)
          result.row = rect('.purchase-entries'); result.filter = rect('.filter-control'); result.sort = rect('.sort-picker')
          result.surfaces = ['.filter-surface', '.sort-control'].map(rect)
          result.stacked = getComputedStyle(document.querySelector('.wishlist-entry')).flexDirection === 'column'
          result.centered = [...document.querySelectorAll('.purchase-entries button')].every(button => {
            const b = button.getBoundingClientRect(), icon = button.querySelector('img').getBoundingClientRect(), label = button.querySelector('span').getBoundingClientRect()
            return Math.abs((Math.min(icon.left, label.left) + Math.max(icon.right, label.right)) / 2 - (b.left + b.width / 2)) < 1
          })
          const [a, b, c] = result.entries
          if (Math.max(a.width, b.width, c.width) - Math.min(a.width, b.width, c.width) > 1 || a.y !== b.y || a.y !== c.y || Math.abs(a.left - result.row.left) > 1 || Math.abs(c.right - result.row.right) > 1 || !result.centered) throw Error('Unequal or uncentered row')
          if ((width <= 374 || (width === 390 && large)) && !result.stacked) throw Error('Missing vertical layout')
          if ([...result.entries, result.filter, result.sort].some(r => r.height < 44) || (!large && result.surfaces.some(r => Math.abs(r.height - 36) > 1))) throw Error('Incorrect surface/hit size')
        } else {
          result.cost = rect('.cost-card'); result.facts = rect('.facts'); result.storage = rect('.detail-storage-row'); result.expenses = rect('.linked-expenses')
          result.frameOpacity = document.querySelector('.cost-frame') && getComputedStyle(document.querySelector('.cost-frame')).opacity
          result.frameHasBackground = !!document.querySelector('.cost-corner') && getComputedStyle(document.querySelector('.cost-corner')).backgroundImage.startsWith('url(')
          result.decorIntercepts = [...document.querySelectorAll('.cost-frame,.cost-doodle')].some(n => getComputedStyle(n).pointerEvents !== 'none')
          if (result.storage.top < result.facts.bottom || result.storage.bottom > result.expenses.top || result.decorIntercepts) throw Error('Detail order or decoration hit behavior')
          if (!fallback && (result.frameOpacity !== '0.35' || !result.frameHasBackground)) throw Error('Missing low-contrast frame')
          if (fallback && getComputedStyle(document.querySelector('.cost-card')).borderTopColor !== 'rgb(236, 234, 229)') throw Error('Missing fallback')
        }
        if (result.overflow) throw Error('Horizontal overflow')
        return result
      }, { kind, width, large: patch.largeFont, fallback: patch.costDecorError })
      const file = `${name}-${width}.png`; await page.screenshot({ path: path.join(output, file), fullPage: true }); checks.push({ name, file, ...result })
    }
    for (const width of [320, 390, 430, 768]) {
      await capture('items', width, 'entries'); await capture('items', width, 'entries-large-font', { largeFont: true, filterCount: 2 })
      await capture('item', width, 'detail'); await capture('item', width, 'detail-expanded', { factsExpanded: true })
    }
    await capture('item', 320, 'detail-large-font', { largeFont: true, factsExpanded: true, item: { ...item, storage_location_name: '衣柜顶部放旅行配件与换季衣服的收纳箱'.repeat(2) } })
    await capture('item', 320, 'detail-large-values', { factsExpanded: true, item: { ...item, net_cost: '-999999999999.99', dailyNet: '¥-999999999999.99' } })
    await capture('item', 390, 'detail-disposed', { item: { ...item, status: 'disposed', statusText: '已处置', dailyNet: '暂无', net_cost: '0.00' } })
    await capture('item', 390, 'detail-fallback', { costDecorError: true })
    fs.writeFileSync(path.join(output, 'layout-results.json'), JSON.stringify({ checks, remoteWrites: 0, native: false }, null, 2))
    console.log(JSON.stringify({ screenshots: checks.length, overflow: false, equalRows: true, remoteWrites: 0 }))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
