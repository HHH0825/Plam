// Offline layout evidence from the actual homepage WXML, WXSS and native tab assets.
// Fixtures remain local; this tool makes no backend requests.
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')
const root = path.resolve(__dirname, '../miniprogram'), output = path.resolve(__dirname, '../docs/images/item-doodle/layout')
const scratch = path.resolve(__dirname, '../.qa-item-doodle'), source = file => fs.readFileSync(path.join(root, file), 'utf8')
const items = [
  { id: 4, name: '水杯（照片测试）', category: '日常用品', status: 'active', statusText: '使用中', holding_days: 123, dailyNet: '¥0.16', net_cost: '19.90', purchase_date: '2026-06-07', photo_url: '/items/4/photo', art: '/assets/white-doodle/type-daily.png', icon: '☕' },
  { id: 2, name: '陪我旅行的相机', category: '摄影', status: 'idle', statusText: '闲置', holding_days: 365, dailyNet: '¥3.28', net_cost: '1199.00', purchase_date: '2025-10-08', art: '/assets/white-doodle/type-digital.png', is_pinned: true },
  { id: 1, name: '书桌', category: '家居', status: 'disposed', statusText: '已处置', holding_days: 240, dailyNet: '¥-0.83', net_cost: '-200.00', purchase_date: '2026-01-08', art: '/assets/white-doodle/type-home.png' }
]
const categories = ['全部分类', '日常用品', '摄影', '家居']
const scope = { items, shown: items, query: '', status: '', category: '', statusOptions: ['全部状态', '使用中', '闲置', '已处置'],
  statusIndex: 0, categoryIndex: 0, categories, layout: 'list', sortIndex: 0, sortLabels: ['最近添加', '持有最久', '价格 ↓', '净成本/天 ↓'],
  sortOptions: ['最近添加', '持有最久', '购买价格从高到低', '净成本/天从高到低'], photoPaths: {}, photoStates: {}, artErrors: {},
  decorError: false, entryIconErrors: {}, entriesStacked: false, loading: false, error: '', filterCount: 0, filterOpen: false, draftStatusIndex: 0, draftCategoryIndex: 0, draftCategories: categories }
async function main() {
  fs.mkdirSync(scratch, { recursive: true }); fs.mkdirSync(output, { recursive: true })
  const html = path.join(scratch, 'preview.html'); fs.writeFileSync(html, '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  let template = source('pages/items/index.wxml').replace(/<paper-label variant="(add(?:-sage)?)" text="新增"\s*\/>/g,
    (_, variant) => '<div class="paper-label label-' + variant + '"><img class="label-art" src="/assets/paper/' + variant + '.png"><span class="label-text">新增</span></div>')
    .replace(/<(view|block|input)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g, '<$1$2></$1>')
    .replace(/\b(view|block|picker|scroll-view)(?=[\s>])/g, 'div').replace(/\btext(?=[\s>])/g, 'span').replace(/\bimage(?=[\s>])/g, 'img')
  const css = ['app.wxss', 'assets/item-doodle/frame.wxss', 'pages/items/collection.wxss', 'pages/editor/components/paper-label/index.wxss'].map(source).join('\n')
    .replace(/@import[^;]+;/g, '').replace(/(?<![.\w-])page\s*\{/g, 'body {').replace(/(?<![.\w-])view\b/g, 'div')
    .replace(/(?<![.\w-])text\b(?=[:\s{])/g, 'span').replace(/(?<![.\w-])image\b/g, 'img')
  const tabs = JSON.parse(source('app.json')).tabBar
  const base = pathToFileURL(root).href
  const previewCss = css.replace(/url\(['"]?\/assets\//g, "url('"+base+'/assets/')
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--allow-file-access-from-files'] })
  const checks = []
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(html).href)
    await page.evaluate(() => {
      window.render = (template, css, scope, base, tabs) => {
        document.querySelectorAll('style').forEach(s => s.remove())
        const style = document.createElement('style'); style.textContent = css + '\nbody{margin:0} img{object-fit:contain} .thumbnail{object-fit:cover} button,input{font-family:inherit;border:0} input{background:transparent;outline:none} .sheet-body{overflow-y:auto} .native-tabs{position:fixed;bottom:0;left:0;right:0;display:flex;background:' + tabs.backgroundColor + ';height:64px;z-index:10;border-top:1px solid #eee8df}.native-tab{flex:1;display:flex;align-items:center;flex-direction:column;padding-top:6px;font-size:12px;color:' + tabs.color + '}.native-tab img{width:28px;height:28px;margin-bottom:2px}.native-tab:first-child{color:' + tabs.selectedColor + '}'; document.head.append(style)
        const container = document.createElement('div'); container.innerHTML = template
        const value = (expression, s) => new Function('scope', 'with(scope){return (' + expression + ')}')(s)
        const interpolate = (text, s) => text.replace(/{{([\s\S]*?)}}/g, (_, e) => String(value(e, s)))
        function children(parent, s) {
          let matched = false
          for (const node of [...parent.childNodes]) {
            if (node.nodeType === 3) { node.textContent = interpolate(node.textContent, s); continue }
            if (node.nodeType !== 1) continue
            const loop = node.getAttribute('wx:for')
            if (loop) {
              node.removeAttribute('wx:for')
              for (const [index, item] of value(loop.slice(2, -2), s).entries()) {
                const wrapper = document.createElement('div'); wrapper.append(node.cloneNode(true)); children(wrapper, { ...s, index, item }); node.before(...wrapper.childNodes)
              }
              node.remove(); continue
            }
            const condition = node.getAttribute('wx:if'), alternative = node.getAttribute('wx:elif'), otherwise = node.hasAttribute('wx:else')
            if (condition !== null) { matched = !!value(condition.slice(2, -2), s); if (!matched) { node.remove(); continue } }
            else if (alternative !== null) { const ok = !matched && !!value(alternative.slice(2, -2), s); matched = matched || ok; if (!ok) { node.remove(); continue } }
            else if (otherwise) { if (matched) { node.remove(); continue } matched = true } else matched = false
            for (const attribute of [...node.attributes]) {
              if (attribute.name.startsWith('wx:')) node.removeAttribute(attribute.name)
              else { let v = interpolate(attribute.value, s); if (attribute.name === 'src' && v.startsWith('/assets/')) v = base + v; node.setAttribute(attribute.name, v) }
            }
            children(node, s)
          }
        }
        children(container, scope); document.body.replaceChildren(...container.childNodes)
        if (scope._brokenArt) document.querySelectorAll('.hero-paper,.collection-kitten').forEach(image => image.src = base + '/missing-hero.png')
        if (scope._brokenLabel) { const label = document.querySelector('.paper-label'); label.classList.add('paper-fallback'); label.querySelector('.label-art').remove() }
        mountWhiteNav(0,base,scope.filterOpen)
      }
    })
    await require('./white-nav-preview.cjs')(page,root)
    async function capture(width, name, patch = {}) {
      await page.setViewportSize({ width, height: 844 })
      await page.evaluate(({ template, css, scope, base, tabs }) => render(template, css, scope, base, tabs), { template, css: previewCss, scope: { ...scope, ...patch }, base, tabs })
      await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? Promise.resolve() : new Promise(resolve => { i.onload = resolve; i.onerror = resolve }))))
      if(patch._largeFont)await page.evaluate(()=>[...document.querySelectorAll('.page *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]).forEach(([n,size])=>{n.style.fontSize=size*1.3+'px'}))
      if(patch._noBlur)await page.addStyleTag({content:'.glass-surface{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}'})
      if(patch._safeBottom)await page.addStyleTag({content:'.tab-bar{bottom:44px}.collection-page{padding-bottom:142px}'})
      const bounds = await page.evaluate(() => {
        const first = document.querySelector('.item-card'), retry = document.querySelector('.photo-retry'), image = retry && retry.parentElement.querySelector('.item-art')
        const hero = document.querySelector('.collection-hero'), paper = document.querySelector('.hero-paper')
        const copy = document.querySelector('.heading-copy').getBoundingClientRect(), art = document.querySelector('.collection-kitten').getBoundingClientRect()
        const add = document.querySelector('.tab-bar .add')?.getBoundingClientRect() || {height:64}, subtitle = document.querySelector('.collection-heading .subtitle').getBoundingClientRect()
        const search = document.querySelector('.search-wrap').getBoundingClientRect()
        return { overflow: document.documentElement.scrollWidth > innerWidth, firstCard: first && first.getBoundingClientRect().top,
          retryOverlap: retry && retry.getBoundingClientRect().top < image.getBoundingClientRect().bottom,
          paperOpacity: paper && getComputedStyle(paper).opacity, paperInterceptsTaps: paper && getComputedStyle(paper).pointerEvents !== 'none',
          paperClipped: hero && getComputedStyle(hero).overflow === 'hidden', heroBottom: hero && hero.getBoundingClientRect().bottom,
          cardHeight:first?.getBoundingClientRect().height,navWidth:document.querySelector('.tab-bar')?.getBoundingClientRect().width || 0,pawWidth:document.querySelector('.add img')?.getBoundingClientRect().width || 32,hasPlus:!!document.querySelector('.plus'),glassIntercepts:!!document.querySelector('.glass-surface') && getComputedStyle(document.querySelector('.glass-surface')).pointerEvents!=='none',blur:document.querySelector('.glass-surface') && getComputedStyle(document.querySelector('.glass-surface')).backdropFilter,addHeight: add.height, removedTopAdd: !document.querySelector('.add-button'),
          textOverlapsArt: copy.right > art.left + 1, searchOverlapsPaper: search.top < hero.getBoundingClientRect().bottom,
          heroMinHeight: document.querySelector('.collection-heading').getBoundingClientRect().height,
          pageWidth: document.querySelector('.page').getBoundingClientRect().width,
          failedImages: [...document.images].filter(image => !image.naturalWidth).length,
          artInterceptsTaps: getComputedStyle(document.querySelector('.collection-kitten')).pointerEvents !== 'none' }
      })
      const metrics=await page.evaluate(()=>({
        overlap:[...document.querySelectorAll('.item-cost')].some(row=>{
          const a=row.querySelector('.item-days').getBoundingClientRect(),b=row.querySelector('.item-daily').getBoundingClientRect()
          return a.right>b.left+1 && a.bottom>b.top+1 && b.bottom>a.top+1
        }),
        outside:[...document.querySelectorAll('.metric-value')].some(n=>{const r=n.getBoundingClientRect(),c=n.closest('.item-card').getBoundingClientRect();return r.right>c.right||r.bottom>c.bottom}),
        decorationsIntercept:[...document.querySelectorAll('.sketch-frame,.doodle,.days-mark,.title-underline,.card-doodle')].some(n=>getComputedStyle(n).pointerEvents!=='none'),
        missingUnit:[...document.querySelectorAll('.item-daily')].some(n=>n.textContent.includes('暂无')&&n.querySelector('.metric-unit')),
        frameCount:document.querySelectorAll('.sketch-frame').length,
        label:document.querySelector('.item-daily .metric-label')?.textContent,
        metricFont:document.querySelector('.metric-value') && getComputedStyle(document.querySelector('.metric-value')).fontSize
      }))
      if(metrics.overlap||metrics.outside||metrics.decorationsIntercept||metrics.missingUnit)throw Error('Metrics boundary: '+JSON.stringify({width,name,metrics}))
      checks.push({ width, name, ...bounds, ...metrics })
      if (bounds.hasPlus || bounds.pawWidth!==32 || bounds.navWidth>444 || bounds.glassIntercepts || bounds.overflow || bounds.retryOverlap || bounds.paperOpacity !== null || bounds.paperInterceptsTaps ||
        (bounds.firstCard && bounds.heroBottom > bounds.firstCard) || bounds.addHeight < 44 || !bounds.removedTopAdd ||
        bounds.textOverlapsArt || bounds.searchOverlapsPaper || bounds.heroMinHeight < 96 || bounds.pageWidth > 480 || bounds.artInterceptsTaps ||
        bounds.failedImages !== (patch._brokenArt ? 1 : 0)) throw new Error(JSON.stringify(checks.at(-1)))
      if(name==='list'&&width===390&&(bounds.cardHeight<128||bounds.cardHeight>145))throw new Error('Reference card height mismatch: '+JSON.stringify(bounds))
      if(patch.filterOpen){
        const reachable=await page.evaluate(()=>!document.querySelector('.tab-bar') && ['.sheet-reset','.sheet-apply'].every(selector=>{
          const button=document.querySelector(selector),r=button.getBoundingClientRect()
          const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)
          return r.top>=0 && r.bottom<=innerHeight && r.height>=44 && button.contains(hit)
        }))
        if(!reachable)throw new Error('Filter actions are covered or outside viewport')
      }
      await page.screenshot({ path: path.join(output, name + '-' + width + '.png'), animations: 'disabled' })
    }
    for (const width of [320, 390, 430, 768]) {
      await capture(width, 'list'); await capture(width, 'wall', { layout: 'wall' }); await capture(width, 'filters', { filterOpen: true, draftStatusIndex: 1, draftCategoryIndex: 1 })
      await capture(width, 'large-count', { items: { length: 100000 }, shown: items })
    }
    await capture(390,'approved-example',{shown:[{...items[0],name:'水杯',category:'水杯',holding_days:125},{...items[1],name:'平板',category:'数码产品',status:'active',statusText:'使用中',holding_days:119,dailyNet:'¥17.53',is_pinned:false},{...items[2],name:'相机',category:'数码',status:'active',statusText:'使用中',holding_days:638,dailyNet:'¥1.25'}]})
    await capture(320, 'long-values', { shown: [{ ...items[0], name: '一段特别长的物品名称及珍贵旅行回忆'.repeat(3), dailyNet: '¥999999999999.99', net_cost: '999999999999.99' }] })
    await capture(390, 'retry', { photoStates: { 4: 'error' } })
    await capture(390, 'empty', { shown: [], items: [] })
    await capture(320, 'loading', { shown: [], items: [], loading: true })
    await capture(320, 'read-failed', { shown: [], items: [], error: '网络暂时不可用，请重新读取。' })
    await capture(320, 'art-failed', { _brokenArt: true })
    await capture(390,'decor-failed',{decorError:true})
    await capture(390,'many-days',{shown:[{...items[0],holding_days:12345678}]})
    await capture(320,'wall-long-values',{layout:'wall',shown:[{...items[0],name:'特别长的名字'.repeat(5),dailyNet:'¥999999999999.99'}]})
    await capture(390,'large-font-wide',{_largeFont:true})
    await capture(320,'large-font',{_largeFont:true})
    await capture(390,'glass-fallback',{_noBlur:true})
    await capture(390,'zero-negative',{shown:[{...items[0],holding_days:0,dailyNet:'暂无'},{...items[1],dailyNet:'¥-2.00'}]})
    const many=Array.from({length:20},(_,i)=>({...items[i%3],id:100+i}))
    await capture(390,'many-items',{shown:many,items:many})
    await page.evaluate(()=>window.scrollTo(0,500))
    await page.screenshot({path:path.join(output,'scrolled-390.png')})
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
    const last=await page.evaluate(()=>({bottom:[...document.querySelectorAll('.item-card')].at(-1).getBoundingClientRect().bottom,navTop:document.querySelector('.add').getBoundingClientRect().top}))
    if(last.bottom>last.navTop)throw Error('Last item hidden: '+JSON.stringify(last))
    await capture(390,'glass-fallback-content',{shown:many,items:many,_noBlur:true})
    await page.evaluate(()=>window.scrollTo(0,500));await page.screenshot({path:path.join(output,'glass-fallback-scrolled.png')})
    await capture(390,'safe-area',{shown:many,items:many,_safeBottom:true})
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
    const safe=await page.evaluate(()=>({bottom:[...document.querySelectorAll('.item-card')].at(-1).getBoundingClientRect().bottom,navTop:document.querySelector('.add').getBoundingClientRect().top}))
    if(safe.bottom>safe.navTop)throw Error('Safe area covers final item: '+JSON.stringify(safe))
    await page.screenshot({path:path.join(output,'safe-area-bottom.png')})
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(checks, null, 2))
    console.log(JSON.stringify({checks:checks.length,passed:true,widths:[320,390,430,768],cardHeight:checks.find(x=>x.name==='list'&&x.width===390).cardHeight}))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
