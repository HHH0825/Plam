// Offline visual QA: renders the production drawing commands and WXML/CSS.
// Requires an existing Playwright installation; does not use a signed-in browser.
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url')
const { chromium } = require(process.env.PALM_PLAYWRIGHT_PATH || 'playwright')
const root = path.resolve(__dirname, '../miniprogram'), output = path.resolve(__dirname, '../docs/images'), scratch = path.resolve(__dirname, '../.qa-monthly-fix')
const source = file => fs.readFileSync(path.join(root, file), 'utf8')
const fixture = { month: '2026-10', today: '2026-10-07', cutoff_date: '2026-10-07', is_current: true, has_activity: true,
  totals: { purchase_count: 0, purchase_total: '0.00', maintenance_total: '0.00', disposal_total: '500.00', cashflow_net: '-500.00' }, purchases: [], memories: [], purchase_leaders: [] }
async function main() {
  fs.mkdirSync(scratch, { recursive: true }); fs.mkdirSync(output, { recursive: true })
  const html = path.join(scratch, 'preview.html'); fs.writeFileSync(html, '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  const browser = await chromium.launch({ executablePath: process.env.PALM_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--allow-file-access-from-files'] })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(html).href)
    await page.evaluate(({ monthly, renderer }) => {
      const modules = {}
      function run(code, require) { const module = { exports: {} }; new Function('module', 'require', code)(module, require); return module.exports }
      modules.monthly = run(monthly, () => ({ art: type => '/assets/paper/type-' + (type || 'other') + '.png' }))
      modules.renderer = run(renderer, name => name === './monthly' ? modules.monthly : {})
      window.modules = modules
    }, { monthly: source('utils/monthly.js'), renderer: source('utils/report-image.js') })
    const cases = [['monthly-export-fixed', fixture], ['monthly-export-empty', { ...fixture, has_activity: false }], ['monthly-export-long', {
      ...fixture, totals: { ...fixture.totals, purchase_count: 5, purchase_total: '999999999999.99', cashflow_net: '999999999499.99' },
      purchases: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: '一起旅行的相机与珍贵回忆 '.repeat(10), purchase_date: '2026-10-01', purchase_price: '199999999999.99', icon_type: 'digital' })),
      memories: Array.from({ length: 5 }, (_, i) => ({ key: String(i), item_id: i + 1, date: '2026-10-01', label: '相伴一周年', name: '长名称物品'.repeat(10) }))
    }]]
    for (const [name, report] of cases.concat([['monthly-share-cover', fixture]])) {
      const png = await page.evaluate(async ({ report, base, cover }) => {
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
        const layout = modules.renderer[cover ? 'planShareCover' : 'planReport'](context, report)
        canvas.width = layout.width; canvas.height = layout.height
        const images = new Map()
        await Promise.all([...new Set(layout.commands.filter(c => c.kind === 'image').map(c => c.src))].map(src => new Promise((resolve, reject) => {
          const image = new Image(); image.onload = () => { images.set(src, image); resolve() }; image.onerror = reject; image.src = base + src
        })))
        modules.renderer.drawLayout(context, layout, images)
        return canvas.toDataURL('image/png').split(',')[1]
      }, { report, base: pathToFileURL(root).href, cover: name.includes('cover') })
      fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(png, 'base64'))
    }
    const css = ['app.wxss', 'styles/journal.wxss', 'pages/monthly/index.wxss'].map(source).join('\n').replace(/@import[^;]+;/g, '').replace(/(?<![.\w-])page\s*\{/g, 'body {').replace(/\bview\b/g, 'div').replace(/\btext\b(?=[:\s{])/g, 'span').replace(/\bimage\b/g, 'img')
    let template = source('pages/monthly/index.wxml').replace(/<paper-background[^>]*\/>/g, '').replace(/<canvas[\s\S]*?\/>/g, '')
      .replace(/<(view|block)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g, '<$1$2></$1>').replace(/\bview(?=[\s>])/g, 'div').replace(/\bblock(?=[\s>])/g, 'div').replace(/\btext(?=[\s>])/g, 'span').replace(/\bimage(?=[\s>])/g, 'img').replace(/\bpicker(?=[\s>])/g, 'div')
    await page.evaluate(({ template, css, report, base }) => {
      window.renderWxml = (template, css, scope, base) => {
      document.querySelectorAll('style').forEach(s => s.remove())
      const style = document.createElement('style'); style.textContent = css + '\nbody{margin:0} img{object-fit:contain} button{border:0;font-family:inherit}'; document.head.append(style)
      const container = document.createElement('div'); container.innerHTML = template
      const value = (expression, scope) => new Function('scope', 'with(scope){return (' + expression + ')}')(scope)
      const interpolate = (text, scope) => text.replace(/{{([\s\S]*?)}}/g, (_, e) => String(value(e, scope)))
      function children(parent, scope) {
        let matched = false
        for (const node of [...parent.childNodes]) {
          if (node.nodeType === 3) { node.textContent = interpolate(node.textContent, scope); continue }
          if (node.nodeType !== 1) continue
          const loop = node.getAttribute('wx:for')
          if (loop) {
            node.removeAttribute('wx:for')
            const rows = value(loop.slice(2, -2), scope)
            for (const [index, item] of rows.entries()) { const copy = node.cloneNode(true); const wrapper = document.createElement('div'); wrapper.append(copy); children(wrapper, { ...scope, item, index }); node.before(...wrapper.childNodes) }
            node.remove(); continue
          }
          const condition = node.getAttribute('wx:if'), alternative = node.getAttribute('wx:elif'), otherwise = node.hasAttribute('wx:else')
          if (condition !== null) { matched = !!value(condition.slice(2, -2), scope); if (!matched) { node.remove(); continue } }
          else if (alternative !== null) { const ok = !matched && !!value(alternative.slice(2, -2), scope); matched = matched || ok; if (!ok) { node.remove(); continue } }
          else if (otherwise) { if (matched) { node.remove(); continue } matched = true }
          else matched = false
          for (const attribute of [...node.attributes]) {
            if (attribute.name.startsWith('wx:')) node.removeAttribute(attribute.name)
            else { let result = interpolate(attribute.value, scope); if (attribute.name === 'src' && result.startsWith('/assets/')) result = base + result; node.setAttribute(attribute.name, result) }
          }
          if (node.hasAttribute('disabled') && node.getAttribute('disabled') === 'false') node.removeAttribute('disabled')
          children(node, scope)
        }
      }
      children(container, scope); document.body.replaceChildren(...container.childNodes)
      }
      renderWxml(template, css, { report, edition: modules.monthly.presentMonthly(report), loading: false, error: '', month: report.month, maxMonth: '2026-10', imageBusy: false, shareFallback: false, imageError: '', coverPath: '' }, base)
    }, { template, css, report: fixture, base: pathToFileURL(root).href })
    await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? Promise.resolve() : new Promise(resolve => { i.onload = resolve; i.onerror = resolve }))))
    const checks = []
    for (const width of [320, 390, 430, 768]) {
      await page.setViewportSize({ width, height: 900 })
      checks.push(await page.evaluate(() => {
        const title = document.querySelector('.report-lettering').getBoundingClientRect(), brand = document.querySelector('.report-brand').getBoundingClientRect()
        return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, brandOverlap: title.right > brand.left, share: document.querySelector('.share-report').textContent }
      }))
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      await page.setViewportSize({ width, height })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.screenshot({ path: path.join(output, 'monthly-fixed-' + width + '.png'), fullPage: true, animations: 'disabled' })
    }
    fs.writeFileSync(path.join(scratch, 'checks.json'), JSON.stringify(checks, null, 2))
    if (checks.some(c => c.overflow || c.brandOverlap)) throw new Error('Layout overlap: ' + JSON.stringify(checks))
    const item = { id: 4, name: '水杯（照片测试）', category: '日常用品', status: 'active', statusText: '使用中', purchase_date: '2026-06-07', purchase_price: '19.90', holding_days: 122, dailyPurchase: '¥0.16', dailyNet: '¥0.16', net_cost: '19.90', photo_url: '/items/4/photo', art: '/assets/paper/type-daily.png' }
    let itemTemplate = source('pages/items/index.wxml').replace(/<paper-background[^>]*\/>/g, '').replace(/<paper-label[^>]*\/>/g, '')
      .replace(/<(view|block)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g, '<$1$2></$1>').replace(/\bview(?=[\s>])/g, 'div').replace(/\bblock(?=[\s>])/g, 'div').replace(/\btext(?=[\s>])/g, 'span').replace(/\bimage(?=[\s>])/g, 'img').replace(/\bpicker(?=[\s>])/g, 'div')
    const itemCss = ['app.wxss', 'pages/items/collection.wxss'].map(source).join('\n').replace(/@import[^;]+;/g, '').replace(/(?<![.\w-])page\s*\{/g, 'body {').replace(/\bview\b/g, 'div').replace(/\btext\b(?=[:\s{])/g, 'span').replace(/\bimage\b/g, 'img')
    await page.setViewportSize({ width: 390, height: 900 })
    for (const layout of ['list', 'wall']) for (const state of ['unavailable', 'error']) {
      await page.evaluate(({ template, css, item, layout, state, base }) => renderWxml(template, css, {
        items: [item], shown: [item], statusOptions: ['全部状态'], categories: ['全部分类'], sortOptions: ['最近添加'], statusIndex: 0, categoryIndex: 0, sortIndex: 0,
        query: '', status: '', category: '', loading: false, error: '', layout, photoPaths: {}, photoStates: { 4: state }, artErrors: {}
      }, base), { template: itemTemplate, css: itemCss, item, layout, state, base: pathToFileURL(root).href })
      await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? Promise.resolve() : new Promise(resolve => { i.onload = resolve; i.onerror = resolve }))))
      const bounds = await page.evaluate(() => {
        const image = document.querySelector('.item-art').getBoundingClientRect(), status = document.querySelector('.photo-retry,.photo-unavailable').getBoundingClientRect()
        return { imageBottom: image.bottom, statusTop: status.top, overflow: document.documentElement.scrollWidth > innerWidth }
      })
      if (bounds.statusTop < bounds.imageBottom || bounds.overflow) throw new Error('Photo overlaps: ' + JSON.stringify(bounds))
      await page.screenshot({ path: path.join(output, 'photo-fixed-' + layout + '-' + state + '.png'), fullPage: true })
    }
    console.log(JSON.stringify(checks))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
