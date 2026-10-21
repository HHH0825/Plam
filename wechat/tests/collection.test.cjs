const test = require('node:test')
require('./local-config.cjs')
const assert = require('node:assert/strict')
const { select, keepsakes, preferences, savePreferences } = require('../miniprogram/utils/collection')
test('collection combines filters, pin priority, numeric sorts and missing daily cost', () => {
  const items = [
    { id: 1, name: '相机', category: '摄影', status: 'active', daily_net_cost: '-2.00', purchase_price: '900.00', holding_days: 100 },
    { id: 2, name: '相机新', category: '摄影', status: 'active', daily_net_cost: null, purchase_price: '100.00', holding_days: 0 },
    { id: 3, name: '书', category: '阅读', status: 'idle', daily_net_cost: '1.00', purchase_price: '50.00', holding_days: 50, is_pinned: true },
    { id: 4, name: '相机旧', category: '摄影', status: 'active', daily_net_cost: '-2.00', purchase_price: '900.00', holding_days: 100 }
  ]
  assert.deepEqual(select(items, '', '', '', 3).map(i => i.id), [3, 4, 1, 2])
  assert.deepEqual(select(items, '相机', 'active', '摄影', 2).map(i => i.id), [4, 1, 2])
  assert.deepEqual(select(items, '', '', '', 1).map(i => i.id), [3, 4, 1, 2])
  assert.deepEqual(select(items, '', 'active', '阅读'), [])
  assert.deepEqual(items.map(i => i.id), [1, 2, 3, 4])
})
test('preferences contain no item data and remain separate per user', () => {
  const storage = new Map()
  global.wx = { setStorageSync: (k, v) => storage.set(k, v), getStorageSync: k => storage.get(k) }
  savePreferences({ id: 1 }, { layout: 'wall', sortIndex: 3, items: [{ secret: true }] })
  assert.deepEqual(preferences({ id: 1 }), { layout: 'list', sortIndex: 3 })
  assert.deepEqual(preferences({ id: 2 }), { layout: 'list', sortIndex: 0 })
  assert.equal(JSON.stringify([...storage.values()]).includes('secret'), false)
})
test('ascending daily net cost keeps pin priority, missing last, stable ties and old preference indices', () => {
  const rows=[null,'999999999.99','0.00','-3.00','-3.00'].map((cost,i)=>({id:i+1,status:'active',name:'收藏',daily_net_cost:cost}))
  assert.deepEqual(select(rows,'','','',4).map(i=>i.id),[5,4,3,2,1])
  rows[1].is_pinned=true
  assert.deepEqual(select(rows,'','','',4).map(i=>i.id),[2,5,4,3,1])
  const storage=new Map();global.wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v)}
  for(const scope of ['held','disposed'])for(const sortIndex of [0,1,2,3,4]){
    savePreferences({id:99},{layout:'list',sortIndex},scope)
    assert.equal(preferences({id:99},scope).sortIndex,sortIndex)
  }
})
test('retired keepsakes have neither a helper nor a routable page', () => {
  assert.equal(keepsakes, undefined)
  assert.ok(!require('../miniprogram/app.json').pages.includes('pages/keepsakes/index'))
})
test('type illustrations provide transparent compact fallback assets', () => {
  const fs = require('node:fs'), path = require('node:path')
  const { art } = require('../miniprogram/utils/collection')
  for (const type of ['digital', 'home', 'daily', 'clothing', 'books', 'mobility', 'sports', 'tools', 'other']) {
    const png = fs.readFileSync(path.join(__dirname, '../miniprogram', art(type)))
    assert.equal(png.readUInt32BE(16), 128); assert.equal(png.readUInt32BE(20), 128)
    assert.ok(png.includes(Buffer.from('tRNS')), 'palette has alpha')
  }
  assert.equal(art('unknown'), art('other'))
})
function pageHarness(name, options = {}) {
  const requests = [], toasts = []
  const app = { globalData: { token: 'alice', user: { id: 1 } }, hasSession() { return !!this.globalData.token }, requireSession() { return this.hasSession() } }
  global.getApp = () => app
  global.wx = { request: o => requests.push(o), showToast: o => toasts.push(o), getStorageSync() {} }
  let definition
  global.Page = p => { definition = p }
  const path = '../miniprogram/pages/' + name + '/index'
  delete require.cache[require.resolve(path)]; require(path)
  const page = { ...definition, data: structuredClone(definition.data), setData(patch, callback) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data
      while (parts.length > 1) { const part = parts.shift(); target = target[part] || (target[part] = {}) }
      target[parts[0]] = value
    }
    if (callback) callback()
  } }
  page.onLoad(options); page._visible = true
  return { page, app, requests, toasts, respond(index, data) { requests[index].success({ statusCode: 200, data }) } }
}

test('filter sheet drafts are cancelled on dismiss and apply without changing search or sending requests', () => {
  const h = pageHarness('items'), tabs = []
  h.page.getTabBar = () => ({setData:patch=>tabs.push(patch.hidden?'hide':'show')})
  global.wx.hideTabBar = global.wx.showTabBar = () => assert.fail('custom navigation must not use native tab APIs')
  h.page._token = 'alice'
  h.page.data.items = [{ id: 1, name: '相机', status: 'active', category: '摄影' },
    { id: 2, name: '相机旧', status: 'idle', category: '摄影' }, { id: 3, name: '书', status: 'idle', category: '阅读' }]
  h.page.data.categories = ['全部分类', '摄影', '阅读']; h.page.data.query = '相机'
  h.page.apply(); assert.equal(h.page.data.shown.length, 2)
  h.page.openFilters(); h.page.chooseDraftStatus({ currentTarget: { dataset: { index: 2 } } })
  assert.equal(h.page.data.shown.length, 2); assert.equal(h.page.data.status, '')
  h.page.closeFilters(); h.page.openFilters(); assert.equal(h.page.data.draftStatusIndex, 0)
  h.page.chooseDraftStatus({ currentTarget: { dataset: { index: 2 } } })
  h.page.chooseDraftCategory({ currentTarget: { dataset: { index: 1 } } }); h.page.applyFilters()
  assert.deepEqual(h.page.data.shown.map(i => i.id), [2]); assert.equal(h.page.data.filterCount, 2)
  assert.equal(h.page.data.query, '相机'); assert.equal(h.page.data.filterOpen, false)
  h.page.openFilters(); h.page.resetDraftFilters(); assert.equal(h.page.data.status, 'idle')
  h.page.applyFilters(); assert.equal(h.page.data.shown.length, 2); assert.equal(h.page.data.query, '相机')
  assert.deepEqual(tabs, ['hide', 'show', 'hide', 'show', 'hide', 'show']); assert.equal(h.requests.length, 0)
})
test('native picker accepts and persists the fifth sort on held and disposed lists',()=>{
 for(const name of ['items','disposed']){
  const h=pageHarness(name)
  h.page.data.items=[{id:1,name:'负值',status:name==='disposed'?'disposed':'active',daily_net_cost:'-2.00'},{id:2,name:'零值',status:name==='disposed'?'disposed':'active',daily_net_cost:'0.00'}]
  h.page.sortChange({detail:{value:4}})
  assert.equal(h.page.data.sortIndex,4);assert.equal(h.page.data.sortLabels[4],'净成本/天 ↑')
  assert.deepEqual(h.page.data.shown.map(i=>i.id),[1,2])
  assert.equal(h.page.data.sortOptions.length,5)
 }
})

test('filter drafts cannot apply after account change or page hide; reordered categories keep their identity', () => {
  const h = pageHarness('items')
  h.page.data.categories = ['全部分类', '摄影', '阅读']; h.page._token = 'alice'
  h.page.openFilters(); h.page.chooseDraftCategory({ currentTarget: { dataset: { index: 1 } } })
  h.page.data.categories = ['全部分类', '家居', '摄影', '阅读']; h.page.applyFilters()
  assert.equal(h.page.data.category, '摄影'); assert.equal(h.page.data.categoryIndex, 2)
  h.page.openFilters(); h.page.chooseDraftStatus({ currentTarget: { dataset: { index: 2 } } })
  h.app.globalData.token = 'bob'; h.page.applyFilters()
  assert.equal(h.page.data.status, ''); assert.equal(h.page.data.filterOpen, false)
  h.page.openFilters(); h.page.onHide()
  assert.equal(h.page.data.filterOpen, false); assert.equal(h.page.data.draftStatusIndex, 0)
})

test('custom navigation stays hidden during filter reset and returns on every dismiss path', () => {
  const h = pageHarness('items'), visibility = []
  const bar = { setData(patch) { visibility.push(patch.hidden) } }
  h.page.getTabBar = () => bar
  global.wx.hideTabBar = global.wx.showTabBar = () => assert.fail('custom navigation must not use native tab APIs')
  h.page.openFilters(); h.page.resetDraftFilters()
  assert.equal(h.page.data.filterOpen, true); assert.deepEqual(visibility, [true])
  h.page.applyFilters(); assert.equal(visibility.at(-1), false)
  h.page.openFilters(); h.page.closeFilters(); assert.equal(visibility.at(-1), false)
  h.page.openFilters(); h.page.onHide(); assert.equal(visibility.at(-1), false)
  h.page.openFilters(); h.page.onUnload(); assert.equal(visibility.at(-1), false)
  h.page.openFilters(); h.app.globalData.token = 'bob'; h.page.applyFilters()
  assert.equal(h.page.data.filterOpen, false); assert.equal(visibility.at(-1), false)
  assert.equal(h.requests.length, 0)
})
test('return position selects a nearby surviving item and rejects old-account callbacks', () => {
  const h = pageHarness('items'), calls = [], scrolls = []
  h.page.data.shown = [{ id: 1 }, { id: 3 }]
  h.page._anchor = { id: 2, offset: 20, index: 1 }
  global.wx.pageScrollTo = o => scrolls.push(o)
  global.wx.createSelectorQuery = () => ({ in() { return this }, select(selector) { calls.push(selector); return this },
    boundingClientRect() { return this }, selectViewport() { return this }, scrollOffset() { return this }, exec(callback) {
      calls.push(callback)
    } })
  h.page.restorePosition()
  assert.equal(calls[0], '#item-3')
  calls[1]([{ top: 50 }, { scrollTop: 100 }])
  assert.equal(scrolls[0].scrollTop, 130)
  h.page.restorePosition(); h.app.globalData.token = 'bob'
  calls[3]([{ top: 200 }, { scrollTop: 100 }])
  assert.equal(scrolls.length, 1)
})
test('collection and detail no longer expose daily-use actions', () => {
  const h = pageHarness('items')
  assert.equal(h.page.quickUse, undefined)
  const detail = pageHarness('item', { id: 1 })
  assert.equal(detail.page.quickUse, undefined)
  assert.equal(h.requests.length, 0)
})

test('detail removes target writes and exposes linked expense management', () => {
  const h = pageHarness('item', { id: 1 })
  assert.equal(h.page.writeTarget, undefined); assert.equal(h.page.cancelTarget, undefined)
  assert.equal(typeof h.page.expenses, 'function'); assert.equal(h.requests.length, 0)
})
const monthlyFixture = (month = '2025-01') => ({ month, today: '2026-01-01', cutoff_date: month + '-31', is_current: false,
  has_activity: false, totals: { purchase_count: 0, purchase_total: '0.00', maintenance_total: '0.00', disposal_total: '0.00', cashflow_net: '0.00' }, purchases: [], memories: [], purchase_leaders: [] })
test('monthly reload clears old export and earlier month responses cannot replace a new month', async () => {
  const h = pageHarness('monthly')
  h.page.data.imagePath = 'old-image.png'
  const first = h.page.load()
  assert.equal(h.page.data.imagePath, '')
  h.page._requested = '2025-03'
  const second = h.page.load()
  h.respond(1, monthlyFixture('2025-03')); await second
  h.respond(0, monthlyFixture('2025-01')); await first
  assert.equal(h.page.data.report.month, '2025-03')
  const failed = h.page.load()
  h.requests[2].fail({ errMsg: 'failed' }); await failed
  assert.equal(h.page.data.report, null)
  await h.page.saveImage()
  assert.equal(h.requests.length, 3)
})
test('monthly section failure keeps valid discovery stats and text wrap never exceeds reserved lines', async () => {
  const { wrapLines } = require('../miniprogram/utils/monthly')
  const context = { measureText: s => ({ width: Array.from(s).length * 10 }) }
  const lines = wrapLines(context, '一个非常非常长的中文物品名字和 emoji 📷📷📷', 60, 2)
  assert.equal(lines.length, 2); assert.ok(lines[1].endsWith('…'))
  assert.ok(lines.every(line => context.measureText(line).width <= 60))
  const h = pageHarness('insights')
  h.page.data.stats = { total_items: 7 }
  const pending = h.page.loadMonthly()
  h.respond(0, { month: '2025-01' }); await pending
  assert.equal(h.page.data.stats.total_items, 7)
  assert.match(h.page.data.monthlyError, /格式异常/)
})
test('report PNG keeps long entries inside reserved rows and only includes three of each kind', async () => {
  const { reportImage } = require('../miniprogram/utils/report-image')
  const drawn = [], exports = []
  const context = { fillRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    measureText(text) { const size = parseInt(this.font) || 24; return { width: Array.from(text).length * size } },
    fillText(text, x, y) { drawn.push({ text, x, y, size: parseInt(this.font) }) } }
  const canvas = { getContext: () => context, createImage() { const image = {}; Object.defineProperty(image, 'src', { set() { image.onload() } }); return image } }
  global.wx = { createSelectorQuery() { return { in() { return this }, select() { return this },
    fields(options, callback) { callback({ node: canvas }); return this }, exec() {} } },
    canvasToTempFilePath(options) { exports.push(options); options.success({ tempFilePath: 'report.png' }) } }
  const report = monthlyFixture()
  report.has_activity = true
  report.purchases = Array.from({ length: 5 }, (_, i) => ({ name: '独立测试长名称'.repeat(20) + i, purchase_date: '2025-01-01', purchase_price: '0.00' }))
  report.memories = Array.from({ length: 5 }, (_, i) => ({ name: '长名字'.repeat(20) + i, label: '相伴 1 年', date: '2025-01-01' }))
  assert.equal(await reportImage({}, report, () => true), 'report.png')
  assert.equal(exports[0].fileType, 'png')
  assert.equal(exports[0].destWidth, 720)
  assert.ok(exports[0].destHeight > 1000)
  assert.ok(drawn.some(i => /另有 2 件/.test(i.text)))
  assert.ok(!drawn.some(i => /纪念|相伴 1 年|另有 2 条/.test(i.text)))
  assert.ok(drawn.every(i => i.y < exports[0].destHeight - 24))
  const empty = monthlyFixture()
  await reportImage({}, empty, () => true)
  assert.ok(exports[1].destHeight < exports[0].destHeight)
  assert.equal(drawn.some(i => /记录的使用/.test(i.text)), false)
  await assert.rejects(reportImage({}, report, () => false), /取消/)
})

test('held and archived loads scope counts, categories and reset without changing response costs', async () => {
 for (const [name,ids,categories] of [['items',[2,1],['全部分类','摄影','阅读']],['disposed',[4,3],['全部分类','旧物']]]) {
  const h=pageHarness(name);h.page._token='alice'
  const rows=[{id:1,name:'相机',category:'摄影',status:'active',daily_net_cost:'-2.00',holding_days:3},
   {id:2,name:'书',category:'阅读',status:'idle',daily_net_cost:'0.00',holding_days:8},
   {id:3,name:'旧相机',category:'旧物',status:'disposed',daily_net_cost:null,holding_days:15},
   {id:4,name:'旧书',category:'旧物',status:'disposed',daily_net_cost:'1.25',holding_days:20},
   {id:5,name:'回收站',category:'已删',status:'disposed',deleted_at:'2026-10-10'}]
  const synced=[];h.page._photos={sync:rows=>synced.push(rows),release(){}}
  const loading=h.page.load();h.respond(0,rows);await loading
  assert.deepEqual(h.page.data.items.map(i=>i.id),ids.toSorted((a,b)=>a-b))
  assert.deepEqual(h.page.data.shown.map(i=>i.id),ids);assert.deepEqual(h.page.data.categories,categories)
  assert.deepEqual(synced[0].map(i=>i.id),rows.map(i=>i.id),'photo cache receives the decorated full response across scopes')
  assert.deepEqual(synced[0].map(i=>i.daily_net_cost),rows.map(i=>i.daily_net_cost),'decoration preserves response costs')
  h.page.categoryChange({detail:{value:1}});assert.ok(h.page.data.shown.every(i=>i.category===categories[1]));h.page.clearFilters()
  if(name==='items'){h.page.statusChange({detail:{value:1}});assert.deepEqual(h.page.data.shown.map(i=>i.id),[1]);h.page.statusChange({detail:{value:2}});assert.deepEqual(h.page.data.shown.map(i=>i.id),[2]);h.page.clearFilters()}
  h.page.search({detail:{value:'相机'}});assert.equal(h.page.data.shown.length,1)
  h.page.clearFilters();assert.deepEqual(h.page.data.shown.map(i=>i.id),ids)
  h.page.statusChange({detail:{value:3}});assert.deepEqual(h.page.data.shown.map(i=>i.id),ids)
  if(name==='disposed'){assert.equal(h.page.data.shown[0].dailyNet,'¥1.25');assert.equal(h.page.data.shown[1].dailyNet,'暂无')}
 }
})

test('disposal, undo, trash and restore follow actual server status on each list refresh', async () => {
 for(const name of ['items','disposed']) {
  const h=pageHarness(name);h.page._token='alice'
  for(const [status,deleted]of [['active',false],['disposed',false],['disposed',true],['disposed',false],['idle',false]]){
   const pending=h.page.load();h.respond(h.requests.length-1,deleted?[]:[{id:7,name:'物品',category:'日用',status,holding_days:9,daily_net_cost:'-1.00'}]);await pending
   assert.equal(h.page.data.shown.length,name==='disposed'?Number(status==='disposed'&&!deleted):Number(status!=='disposed'&&!deleted))
  }
 }
})

test('archive pin priority, numeric sorts and preferences remain independent of held page', () => {
 const storage=new Map();global.wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v)}
 savePreferences({id:88},{layout:'list',sortIndex:2})
 savePreferences({id:88},{layout:'list',sortIndex:1},'disposed')
 assert.equal(preferences({id:88}).sortIndex,2);assert.equal(preferences({id:88},'disposed').sortIndex,1)
 assert.equal(preferences({id:89},'disposed').sortIndex,0)
 const h=pageHarness('disposed');h.page.data.items=[{id:1,status:'disposed',holding_days:99,daily_net_cost:'-1'},
  {id:2,status:'disposed',holding_days:5,daily_net_cost:null,is_pinned:true},{id:3,status:'active',holding_days:1000}]
 h.page.sortChange({detail:{value:1}});assert.deepEqual(h.page.data.shown.map(i=>i.id),[2,1])
 global.wx.hideTabBar=global.wx.showTabBar=()=>assert.fail('archive has no tab bar')
 h.page.openFilters();h.page.resetDraftFilters();h.page.applyFilters();assert.equal(h.page.data.filterOpen,false)
})

test('archive late responses and photo callbacks cannot expose a previous account', async () => {
 const h=pageHarness('disposed');h.page._token='alice';const loading=h.page.load()
 h.app.globalData.token='bob';h.page.onHide();h.respond(0,[{id:99,status:'disposed',name:'private'}]);await loading
 assert.deepEqual(h.page.data.items,[]);assert.deepEqual(h.page.data.photoPaths,{})
})

test('archive filters and scroll survive re-opening without overwriting held view state', async () => {
 const first=pageHarness('disposed');first.page._token='alice';first.page.data.query='相机';first.page.data.category='摄影';first.page._scroll=201;first.page._anchor={id:4,index:1,offset:22};first.page.onUnload()
 const held=pageHarness('items');held.page.onShow();assert.equal(held.page.data.query,'');assert.equal(held.page._scroll,0)
 const next=pageHarness('disposed');next.page.onShow();assert.equal(next.page.data.query,'相机');assert.equal(next.page._scroll,201);assert.equal(next.page._anchor.id,4)
 next.app.globalData.token='bob';next.page.onHide();next.page.onShow();assert.equal(next.page.data.query,'');assert.equal(next.page._anchor,null)
})

test('archive photo retry retains the shared loader and rejects a late old-account thumbnail', async () => {
 const h=pageHarness('disposed');h.page._token='alice';h.page.data.shown=[{id:3,status:'disposed',photo_url:'/items/3/photo'}]
 let resolve;const priorities=[]
 h.page._photos={release(){},load(item,owner,size,priority){priorities.push([item.id,size,priority]);return new Promise(r=>{resolve=r})}}
 h.page.data.photoStates={3:'error'};h.page.retryPhoto({currentTarget:{dataset:{id:3}}})
 assert.equal(h.page.data.photoStates[3],'loading');assert.deepEqual(priorities,[[3,'thumb',0]])
 h.app.globalData.token='bob';h.page.onHide();resolve('alice-private-photo');await new Promise(r=>setImmediate(r))
 assert.deepEqual(h.page.data.photoPaths,{});assert.deepEqual(h.page.data.photoStates,{})
})
