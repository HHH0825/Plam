const test = require('node:test')
require('./local-config.cjs')
const assert = require('node:assert/strict')
const view = require('../miniprogram/utils/view')
const { welcomeLayout, readWindowInfo } = require('../miniprogram/pages/login/lib/layout')
const tick = () => new Promise(resolve => setImmediate(resolve))

test('Me overview distinguishes real zero, old backend and invalid values without lifetime substitution', () => {
  const { readOverview, readAccountAge } = require('../miniprogram/utils/me-overview')
  assert.deepEqual(readOverview({held_items:0,held_purchase_total:'0.00'}), {heldItems:'0',heldAmount:'0.00',statsCompatible:true})
  assert.equal(readOverview({held_items:28,held_purchase_total:'12345678.90'}).heldAmount, '12,345,678.90')
  assert.deepEqual(readOverview({total_items:99,purchase_total:'999.00'}), {heldItems:'—',heldAmount:'—',statsCompatible:false})
  assert.throws(()=>readOverview({held_items:-1}), /格式异常/)
  assert.throws(()=>readOverview({held_purchase_total:12}), /格式异常/)
  for (const value of [null, undefined, 0, -1, '128']) assert.equal(readAccountAge({account_age_days:value}), '—')
  assert.equal(readAccountAge({account_age_days:1}), '1')
})

test('Me profile and statistics load independently, retry clears errors, hide rejects late stats', async () => {
  const h=profileHarness(), page=h.page('me')
  const profile=page.load(), stats=page.loadStats()
  assert.equal(h.requests.length,2)
  h.respond(0,{user:h.app.globalData.user,account_age_days:128});await profile
  h.respond(1,{error:'统计暂不可用'},503);await stats
  assert.equal(page.data.accountDays,'128');assert.equal(page.data.user.username,'原昵称')
  assert.match(page.data.statsError,/统计暂不可用/)
  const retry=page.loadStats();assert.equal(page.data.statsError,'')
  h.respond(2,{held_items:28,held_purchase_total:'12680.00'});await retry
  assert.equal(page.data.heldAmount,'12,680.00');assert.equal(page.data.heldItems,'28')
  const late=page.loadStats();page.onHide();h.respond(3,{held_items:88,held_purchase_total:'1.00'});await late
  assert.equal(page.data.heldItems,'—');assert.equal(page.data.user,null)
})

test('Me stats survive profile failure and account switch rejects old responses', async () => {
  const h=profileHarness(),page=h.page('me')
  const profile=page.load(),stats=page.loadStats()
  h.respond(1,{held_items:2,held_purchase_total:'0.00'});await stats
  h.respond(0,{error:'资料暂不可用'},503);await profile
  assert.equal(page.data.heldItems,'2');assert.equal(page.data.heldAmount,'0.00')
  assert.match(page.data.error,/资料暂不可用/)
  const late=page.loadStats();h.app.globalData.token='bob-session'
  h.respond(2,{held_items:88,held_purchase_total:'999.00'});await late
  assert.equal(page.data.heldItems,'2')
})

test('white theme text and status colors retain accessible contrast', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const css = fs.readFileSync(path.join(__dirname, '../miniprogram/app.wxss'), 'utf8')
  const colors = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(match => [match[1], match[2]]))
  assert.equal(colors.bg, '#FFFFFF')
  assert.equal(colors.paper, '#FFFFFF')
  const luminance = color => {
    const linear = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return linear.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  }
  const pairs = [['ink', 'primary'], ['muted', 'bg'], ['muted', 'paper'], ['accent', 'paper'], ['accent', 'bg'],
    ['peach-ink', 'peach'], ['yellow-ink', 'yellow'], ['mint-ink', 'mint'], ['lavender-ink', 'lavender'],
    ['blue', 'blue-soft'], ['neutral-ink', 'neutral'], ['danger', 'danger-soft'],
    ['ink', 'ledger'], ['muted', 'ledger'], ['ink-soft', 'ledger'],
    ...['peach', 'yellow', 'mint', 'lavender', 'blue-soft', 'neutral'].map(background => ['ink-soft', background]),
    ['mint-ink', 'glass-selection-pressed']]
  for (const [foreground, background] of pairs) {
    assert.ok(colors[foreground] && colors[background], `missing color for ${foreground}/${background}`)
    const [dark, light] = [luminance(colors[foreground]), luminance(colors[background])].sort((a, b) => a - b)
    assert.ok((light + 0.05) / (dark + 0.05) >= 4.5, `low contrast: ${foreground}/${background}`)
  }
})

test('paper artwork references exist and native label text survives a failed image', () => {
  const fs = require('node:fs'), path = require('node:path')
  const root = path.join(__dirname, '../miniprogram')
  const visit = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? visit(file) : [file]
  })
  for (const file of visit(root).filter(file => /\.(wxml|wxss)$/.test(file))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/\/assets\/paper\/([^'"\s)]+)/g)) {
      if (!match[1].includes('{{')) assert.ok(fs.existsSync(path.join(root, 'assets/paper', match[1])), file)
    }
  }
  const css = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
  assert.doesNotMatch(css, /data:image/, 'white background has no grain')
  let definition
  global.Component = value => { definition = value }
  const modulePath = '../miniprogram/pages/editor/components/paper-label/index'
  delete require.cache[require.resolve(modulePath)]
  require(modulePath)
  const label = { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch) } }
  for (const variant of ['add', 'add-sage', 'collection', 'identity', 'purchase', 'memories', 'login', 'save']) {
    definition.observers.variant.call(label, variant)
    for (const suffix of ['svg', 'png']) {
      const file = path.join(root, 'assets/white-doodle', `label-${label.data.art}.${suffix}`)
      assert.ok(fs.existsSync(file), file)
      if (suffix === 'png') assert.ok(fs.readFileSync(file).includes(Buffer.from('tRNS')), 'PNG uses palette transparency')
    }
    definition.methods.imageError.call(label)
    assert.equal(label.data.imageFailed, true)
    definition.observers.variant.call(label, variant)
    assert.equal(label.data.imageFailed, false)
  }
  definition.observers.variant.call(label, '../untrusted')
  assert.equal(label.data.art, 'identity')
  const template = fs.readFileSync(path.join(root, 'pages/editor/components/paper-label/index.wxml'), 'utf8')
  assert.match(template, /binderror="imageError"/)
  assert.match(template, /<text class="label-text">\{\{text\}\}<\/text>/)
})

// Use the real request/session/page code with a controlled WeChat runtime.
function profileHarness() {
  // Canvas encoding is covered separately; page tests control only submission flow.
  require('../miniprogram/utils/photo-edit').preparePhoto = async (_page, src) => src
  const requests = [], navigation = [], storage = new Map()
  let appDefinition
  global.App = definition => { appDefinition = definition }
  global.wx = {
    request(options) { if(options.url.endsWith('/membership'))options.success({statusCode:404,data:{error:'not supported'}});else if(options.url.endsWith('/auth/me')&&typeof getCurrentPages==='function'&&getCurrentPages().at(-1)?.route==='pages/editor/index')options.success({statusCode:200,data:{capabilities:{item_cover_icons:false,cash_ledger:0}}});else if(options.url.endsWith('/storage-locations'))options.success({statusCode:200,data:{locations:[],unassigned_count:0}});else requests.push(options) },
    setStorageSync(key, value) { storage.set(key, structuredClone(value)) },
    getStorageSync(key) { return storage.get(key) },
    removeStorageSync(key) { storage.delete(key) },
    navigateTo(options) { navigation.push(['navigateTo', options.url]) },
    navigateBack(options = {}) { navigation.push(['navigateBack', options.delta]) },
    switchTab(options) { navigation.push(['switchTab', options.url]);options.success?.() },
    reLaunch(options) { navigation.push(['reLaunch', options.url]) },
    showToast() {},
    getFileSystemManager() { return { stat(o) { o.success({ stats: { size: 1024 } }) }, unlink(o) { o.complete() } } }
  }
  require('../miniprogram/utils/api').clearPhotos()
  delete require.cache[require.resolve('../miniprogram/app')]
  require('../miniprogram/app')
  const app = { ...appDefinition, globalData: { token: 'alice-session', accessToken:'alice-session',
    expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { id: 1, username: '原昵称', avatar_key: 'sprout' } } }
  global.getApp = () => app
  global.getCurrentPages = () => [{ route: 'pages/me/index' }, { route: 'pages/profile/index' }]
  function page(name = 'profile') {
    let definition
    global.Page = value => { definition = value }
    const path = name==='about'?'../miniprogram/pages/login/about':`../miniprogram/pages/${name}/index`
    delete require.cache[require.resolve(path)]
    require(path)
    const instance = { ...definition, data: structuredClone(definition.data),
      setData(patch) { Object.assign(this.data, patch) } }
    instance.route='pages/'+name+'/index'
    if(name==='editor')global.getCurrentPages=()=>[instance]
    instance.onLoad(name === 'editor' ? {} : undefined)
    if(name==='editor')instance.data.paymentReady=true
    instance._visible = true
    return instance
  }
  function respond(index, data, statusCode = 200) { requests[index].success({ statusCode, data }) }
  async function loaded(name = 'profile') {
    const instance = page(name)
    const index = requests.length
    const promise = instance.load()
    respond(index, { user: structuredClone(app.globalData.user) })
    await promise
    return instance
  }
  return { app, page, loaded, respond, requests, storage, navigation, appDefinition }
}

test('about paper keeps artwork fallbacks and opens items without invoking login',()=>{
 const h=profileHarness(),p=h.page('about');let calls=0;h.app.login=()=>calls++;
 assert.deepEqual(h.navigation,[]);p.logoError();assert.equal(p.data.logoFailed,true);p.login();assert.equal(calls,0);assert.deepEqual(h.navigation,[['switchTab','/pages/items/index']])
})

test('save ticket preserves validation, duplicate protection and partial photo success', async () => {
  const h = profileHarness()
  const page = h.page('editor')
  page.data.form = { ...page.data.form, name: '相机', category: '收藏', purchase_price: '200' }
  const bad = page.save()
  await page.save()
  assert.equal(h.requests.length, 1)
  h.respond(0, { error: '请检查购买日期' }, 400)
  await bad
  assert.equal(page.data.busy, false)
  assert.equal(page.data.form.name, '相机')
  assert.equal(page.data.error, '请检查购买日期')
  assert.deepEqual(h.navigation, [])
  const uploads = [], notices = []
  global.wx.uploadFile = options => { uploads.push(options) }
  global.wx.showModal = options => { notices.push(options) }
  page.data.photoPath = 'synthetic-photo.png'
  const saved = page.save()
  await page.save()
  await tick()
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[1].method, 'POST')
  h.respond(1, { id: 12 })
  await tick()
  assert.equal(uploads.length, 1)
  assert.match(uploads[0].url, /\/items\/12\/photo$/)
  uploads[0].fail()
  await tick()
  assert.equal(notices[0].title, '物品已保存')
  assert.match(notices[0].content, /照片上传失败/)
  assert.equal(page.data.busy, true)
  await page.save()
  assert.equal(h.requests.length, 2)
  notices[0].complete()
  await saved
  assert.equal(page.data.busy, false)
  assert.deepEqual(h.navigation, [['navigateBack', undefined]])
  const edited = h.page('editor')
  edited.itemId = 12
  const update = edited.save()
  assert.equal(h.requests[2].method, 'PUT')
  assert.match(h.requests[2].url, /\/items\/12$/)
  h.respond(2, { id: 12 })
  await update
  assert.equal(edited.data.busy, false)
})

test('preset avatars preview all six illustrations and fall back without stale image errors', async () => {
  const { AVATAR_KEYS, avatarState } = require('../miniprogram/utils/profile')
  assert.equal(avatarState(null).avatarPath, '/assets/paper/avatar-sprout.png')
  assert.equal(avatarState({ avatar_key: 'unknown' }).avatarIndex, 0)
  const h = profileHarness(), page = await h.loaded()
  for (const [index, key] of AVATAR_KEYS.entries()) {
    page.avatarChange({ detail: { value: String(index) } })
    const src = `/assets/paper/avatar-${key}.png`
    assert.equal(page.data.avatarPath, src)
    assert.equal(page.data.avatarFailed, false)
    page.avatarError({ currentTarget: { dataset: { src } } })
    assert.equal(page.data.avatarFailed, true)
    assert.ok(page.data.avatarSymbol)
  }
  page.avatarChange({ detail: { value: '1' } })
  page.avatarError({ currentTarget: { dataset: { src: '/assets/paper/avatar-star.png' } } })
  assert.equal(page.data.avatarFailed, false)
})

test('profile copies only the server-issued current account ID without a write request', async () => {
  const h = profileHarness(), page = h.page(), clipboard = []
  global.wx.setClipboardData = options => clipboard.push(options)
  page.copyUserId();assert.equal(clipboard.length,0)
  const read=page.load();h.respond(0,{user:{...h.app.globalData.user,id:73}});await read
  page.nameInput({detail:{value:'新的昵称'}});page.copyUserId()
  assert.equal(clipboard[0].data,'73');assert.equal(h.requests.length,1)
  assert.equal(page.data.accountId,'73')
  page.onHide();assert.equal(page.data.accountId,'');page.copyUserId();assert.equal(clipboard.length,1)
})

test('profile account switch clears IDs and blocks copying stale account information', async () => {
  const h=profileHarness(),page=await h.loaded(),clipboard=[]
  global.wx.setClipboardData=options=>clipboard.push(options)
  h.app.globalData.token='bob-session';page.copyUserId();assert.equal(clipboard.length,0)
  const read=page.load();assert.equal(page.data.accountId,'');assert.equal(page.data.user,null)
  page.copyUserId();assert.equal(clipboard.length,0)
  h.respond(1,{user:{id:82,username:'乙',avatar_key:'book'}});await read
  page.copyUserId();assert.equal(clipboard[0].data,'82')
  const later=page.load();page.onHide();h.respond(2,{user:{id:82,username:'乙',avatar_key:'book'}});await later
  assert.equal(page.data.accountId,'')
})

test('profile missing ID never invents an identifier; clipboard failure is scoped to its account', async () => {
  const h=profileHarness(),page=await h.loaded(),clipboard=[],notices=[]
  global.wx.setClipboardData=options=>clipboard.push(options)
  global.wx.showToast=options=>notices.push(options)
  page.copyUserId();clipboard[0].fail();assert.match(notices[0].title,/复制未完成/)
  h.app.globalData.token='bob-session';clipboard[0].fail();assert.equal(notices.length,1)
  const read=page.load();h.respond(1,{user:{username:'旧接口',avatar_key:'cat'}});await read
  assert.equal(page.data.accountId,'');page.copyUserId();assert.equal(clipboard.length,1)
})

test('profile saves once, keeps credentials and persists updated user across restart', async () => {
  const h = profileHarness()
  const page = await h.loaded()
  page.nameInput({ detail: { value: '新的手账昵称' } })
  page.avatarChange({ detail: { value: '1' } })
  const expiresAt = h.app.globalData.expiresAt
  assert.equal(page.data.avatarPath, '/assets/paper/avatar-cat.png')
  const pending = page.save()
  await page.save()
  assert.equal(h.requests.length, 2)
  assert.match(h.requests[1].url, /\/api\/mp\/profile$/)
  assert.equal(h.requests[1].method, 'PUT')
  assert.deepEqual(h.requests[1].data, { username: '新的手账昵称', avatar_key: 'cat' })
  const user = { id: 1, username: '新的手账昵称', avatar_key: 'cat' }
  h.respond(1, { user })
  await pending
  assert.equal(page.data.busy, false)
  assert.deepEqual(h.app.globalData, { token: 'alice-session', accessToken:'alice-session', expiresAt, user })
  assert.deepEqual(h.storage.get('palmSession:local:http://127.0.0.1:5001'), h.app.globalData)
  assert.deepEqual(h.navigation, [['navigateBack', 1]])
  const restarted = { ...h.appDefinition, globalData: { token: '', expiresAt: 0, user: null } }
  restarted.onLaunch()
  assert.deepEqual(restarted.globalData, h.app.globalData)
  const me = await h.loaded('me')
  assert.equal(me.data.avatarPath, '/assets/paper/avatar-cat.png')
  me.avatarError({ currentTarget: { dataset: { src: me.data.avatarPath } } })
  assert.equal(me.data.avatarFailed, true)
  const reread = me.load()
  h.respond(h.requests.length - 1, { user })
  await reread
  assert.equal(me.data.avatarPath, '/assets/paper/avatar-cat.png')
  assert.equal(me.data.avatarFailed, false)
})

test('profile blocks saving before a successful read and keeps draft after validation failure', async () => {
  const h = profileHarness()
  const page = h.page()
  await page.save()
  assert.equal(h.requests.length, 0)
  const failed = page.load()
  h.respond(0, { error: '读取失败' }, 503)
  await failed
  assert.equal(page.data.loaded, false)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '读取失败')
  await page.save()
  assert.equal(h.requests.length, 1)
  const retry = page.load()
  h.respond(1, { user: h.app.globalData.user })
  await retry
  page.nameInput({ detail: { value: 'x' } })
  page.avatarChange({ detail: { value: '5' } })
  const save = page.save()
  h.respond(2, { error: '显示名称至少 2 个字符' }, 400)
  await save
  assert.equal(page.data.name, 'x')
  assert.equal(page.data.avatarIndex, 5)
  assert.match(page.data.error, /至少 2/)
  assert.equal(page.data.busy, false)
  assert.equal(h.storage.size, 0)
  assert.deepEqual(h.navigation, [])
})

test('profile return discards draft and standalone page returns to Me tab without writing', async () => {
  const h = profileHarness()
  const page = await h.loaded()
  page.nameInput({ detail: { value: '不保存' } })
  page.back()
  page.onHide()
  assert.equal(page.data.name, '')
  assert.equal(h.requests.length, 1)
  assert.equal(h.app.globalData.user.username, '原昵称')
  global.getCurrentPages = () => [{ route: 'pages/profile/index' }]
  page.back()
  assert.deepEqual(h.navigation, [['navigateBack', 1], ['switchTab', '/pages/me/index']])
})

test('profile reads discard reordered responses and old account data', async () => {
  const h = profileHarness()
  const page = h.page()
  const first = page.load()
  const second = page.load()
  h.respond(1, { user: { id: 1, username: '最新昵称', avatar_key: 'book' } })
  await second
  h.respond(0, { user: { id: 1, username: '旧昵称', avatar_key: 'cat' } })
  await first
  assert.equal(page.data.name, '最新昵称')
  const oldAccount = page.load()
  h.app.globalData = { token: 'bob-session', expiresAt: h.app.globalData.expiresAt, user: { id: 2, username: '乙' } }
  h.respond(2, { user: { id: 1, username: '甲', avatar_key: 'sun' } })
  await oldAccount
  assert.notEqual(page.data.name, '甲')
  assert.equal(h.storage.size, 0)
})

test('profile late reads and saves after leaving do not change page, session or navigation', async () => {
  for (const leave of ['onHide', 'onUnload']) {
    const h = profileHarness()
    const page = await h.loaded()
    const save = page.save()
    page[leave]()
    const snapshot = structuredClone(page.data)
    h.respond(1, { user: { id: 1, username: '迟来的修改', avatar_key: 'cat' } })
    await save
    assert.deepEqual(page.data, snapshot)
    assert.equal(h.app.globalData.user.username, '原昵称')
    assert.equal(h.storage.size, 0)
    assert.deepEqual(h.navigation, [])
    const readPage = h.page()
    const read = readPage.load()
    readPage[leave]()
    h.respond(2, { user: { id: 1, username: '迟来的读取', avatar_key: 'sun' } })
    await read
    assert.equal(readPage.data.user, null)
  }
})

test('profile switched-account save cannot replace the new session or navigate it away', async () => {
  const h = profileHarness()
  const page = await h.loaded()
  const save = page.save()
  const bob = { token: 'bob-session', expiresAt: h.app.globalData.expiresAt, user: { id: 2, username: '乙' } }
  h.app.globalData = bob
  h.respond(1, { user: { id: 1, username: '甲的新昵称' } })
  await save
  assert.deepEqual(h.app.globalData, bob)
  assert.equal(h.storage.size, 0)
  assert.deepEqual(h.navigation, [])
})

test('profile reports partial success when storage fails and refuses expired session updates', async () => {
  const h = profileHarness()
  const page = await h.loaded()
  wx.setStorageSync = () => { throw new Error('storage full') }
  const save = page.save()
  h.respond(1, { user: { id: 1, username: '已保存到服务器', avatar_key: 'cat' } })
  await save
  assert.match(page.data.error, /资料已保存/)
  assert.equal(page.data.busy, false)
  h.app.globalData.expiresAt = 1
  assert.equal(h.app.updateUser({ id: 1, username: '过期资料' }, 'alice-session'), false)
  assert.equal(h.app.globalData.user.username, '已保存到服务器')
})

test('Me enters profile, reloads current user and exposes about instead of logout', async () => {
  const h = profileHarness()
  const page = await h.loaded('me')
  page.profile()
  assert.deepEqual(h.navigation, [['navigateTo', '/pages/profile/index']])
  page.onHide()
  assert.equal(page.data.user, null)
  page._visible = true
  const reload = page.load()
  h.respond(1, { user: { id: 1, username: '返回后的昵称', avatar_key: 'star' } })
  await reload
  assert.equal(page.data.user.username, '返回后的昵称')
  assert.equal(page.data.avatarSymbol, '✦')
  assert.equal(page.data.avatarPath, '/assets/paper/avatar-star.png')
  page._navigation=null;page.about()
  assert.deepEqual(h.navigation[1],['navigateTo','/pages/login/about'])
  assert.equal(typeof page.logout,'undefined')
})

test('welcome sizing handles short, tall and wide windows without oversized artwork', () => {
  const small = welcomeLayout({ windowWidth: 320, windowHeight: 504 })
  assert.equal(small.compact, true)
  assert.equal(small.heroStyle, 'height:175px;')
  assert.match(small.pageStyle, /--welcome-title:28px/)
  const tall = welcomeLayout({ windowWidth: 366, windowHeight: 745 })
  assert.equal(tall.compact, false)
  assert.equal(tall.heroStyle, 'height:217px;')
  const large = welcomeLayout({ windowWidth: 1024, windowHeight: 1200 })
  assert.equal(large.heroStyle, 'height:245px;')
  assert.match(large.pageStyle, /--welcome-title:34px/)
  assert.match(large.pageStyle, /padding-left:24px/)
})

test('missing or invalid window data preserves a usable default layout', () => {
  assert.deepEqual(welcomeLayout({ windowWidth: NaN, windowHeight: -1 }), welcomeLayout())
  global.wx = { getWindowInfo() { throw new Error('unavailable') } }
  assert.deepEqual(readWindowInfo(), {})
  global.wx = {}
  assert.deepEqual(readWindowInfo(), {})
})

test('welcome page reflows on window resize without triggering login', () => {
  let definition
  global.Page = page => { definition = page }
  global.getApp = () => ({ hasSession: () => false })
  global.wx = { getWindowInfo: () => ({ windowWidth: 390, windowHeight: 753 }) }
  delete require.cache[require.resolve('../miniprogram/pages/login/about')]
  require('../miniprogram/pages/login/about')
  const page = { ...definition, data: { ...definition.data }, setData(value) { Object.assign(this.data, value) } }
  page.onLoad()
  assert.equal(page.data.heroStyle, 'height:231px;')
  page.onResize({ size: { windowWidth: 320, windowHeight: 504 } })
  assert.equal(page.data.heroStyle, 'height:175px;')
  assert.equal(page.data.compact, true)
  assert.equal(page.data.busy, false)
})

test('display costs, status and fallback icon without changing calculations', () => {
  const item = view.decorate({ icon_type: 'digital', status: 'disposed', daily_net_cost: '-0.50', daily_purchase_cost: null })
  assert.equal(item.dailyNet, '¥-0.50')
  assert.equal(item.dailyPurchase, '暂无')
  assert.equal(item.statusText, '已处置')
  assert.equal(view.icon('unsupported'), view.icon('other'))
})

test('search and status filters combine for one account list', () => {
  const items = [
    { name: '相机', category: '数码', notes: '摄影', status: 'active' },
    { name: '旧相机', category: '数码', notes: '', status: 'disposed' },
    { name: '书', category: '纸品', notes: '', status: 'active' }
  ]
  assert.deepEqual(view.filterItems(items, '相机', 'active'), [items[0]])
  assert.deepEqual(view.filterItems(items, '摄影', ''), [items[0]])
  assert.equal(view.filterItems(items, '无结果', '').length, 0)
})

test('in-flight response cannot return old-account data after switching', async () => {
  let respond
  const app = { globalData: { token: 'old' }, clearSession() {} }
  global.getApp = () => app
  global.wx = { request(options) { respond = options.success }, reLaunch() {} }
  const api = require('../miniprogram/utils/api')
  const pending = api.request('/items')
  app.globalData.token = 'new'
  respond({ statusCode: 200, data: [{ name: '旧账户的物品' }] })
  await assert.rejects(pending, /账户已切换/)
})

test('item page reuses thumbnails on return, preserves offline content and clears switched-account data', async () => {
  const api = require('../miniprogram/utils/api'), downloads = [], observers = []
  const originalRequest = api.request
  let definition
  global.getApp = () => ({ globalData: { token: 'photo-owner' },hasSession:()=>true,requireSession:()=>true })
  global.Page = page => { definition = page }
  global.wx = {
    downloadFile(options) { downloads.push(options); return { abort() { options.fail() } } },
    getFileSystemManager() { return { stat(o) { o.success({ stats: { size: 1234 } }) }, unlink(o) { o.complete() } } },
    createIntersectionObserver() { return { relativeToViewport() { return this }, observe(selector, callback) { observers.push(callback) }, disconnect() {} } }
  }
  api.clearPhotos()
  api.request = async () => [{ id: 1, name: '相机', category: '数码', status: 'active', icon_type: 'digital', photo_url: '/photo', photo_version: 'v1' }]
  try {
    delete require.cache[require.resolve('../miniprogram/pages/items/index')]
    require('../miniprogram/pages/items/index')
    const page = { ...definition, data: structuredClone(definition.data), setData(patch, callback) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.'); let target = this.data
        while (parts.length > 1) { const part = parts.shift(); target = target[part] || (target[part] = {}) }
        target[parts[0]] = value
      }
      if (callback) callback()
    } }
    page.onLoad(); page._visible = true; await page.load()
    page._token = 'photo-owner'
    assert.equal(downloads.length, 0)
    observers[0]({ intersectionRatio: 1, dataset: { id: 1 } }); await tick()
    assert.equal(downloads.length, 1)
    assert.match(downloads[0].url, /size=thumb/)
    downloads[0].success({ statusCode: 200, tempFilePath: 'temporary-photo' }); await tick()
    assert.equal(page.data.photoPaths[1], 'temporary-photo')
    page.onHide(); assert.equal(page.data.photoPaths[1], 'temporary-photo')
    page._visible = true; await page.load()
    observers[2]({ intersectionRatio: 1, dataset: { id: 1 } }); await tick()
    assert.equal(downloads.length, 1)
    assert.equal(page.data.photoPaths[1], 'temporary-photo')
    api.request = async () => { throw new Error('offline') }
    await page.load(); assert.equal(page.data.photoPaths[1], 'temporary-photo'); assert.match(page.data.error, /offline/)
    page.photoFailed({ currentTarget: { dataset: { id: 1 } } })
    observers[2]({ intersectionRatio: 1, dataset: { id: 1 } }); await tick()
    assert.equal(downloads.length, 1, 'failed images do not loop automatically')
    page.retryPhoto({ currentTarget: { dataset: { id: 1 } } }); await tick()
    assert.equal(downloads.length, 2)
    global.getApp = () => ({ globalData: { token: 'another-account' } })
    page.onHide(); page.onUnload()
    assert.deepEqual(page.data.items, []); assert.deepEqual(page.data.photoPaths, {})
  } finally { api.request = originalRequest; api.clearPhotos() }
})

test('login selects the correct credential and preserves session on failure', async () => {
  const config = require('../miniprogram/config')
  const api = require('../miniprogram/utils/api')
  const oldFlag = config.DEV_LOGIN
  const oldRequest = api.request
  let definition
  let wechatCalls = 0
  const saved = []
  global.App = app => { definition = app }
  global.wx = {
    login(options) { wechatCalls += 1; options.success({ code: 'real-wechat-code' }) },
    setStorageSync(key, value) { saved.push({ key, value }) }
  }
  try {
    delete require.cache[require.resolve('../miniprogram/app')]
    require('../miniprogram/app')
    for (const devLogin of [true, false]) {
      config.DEV_LOGIN = devLogin
      let submitted
      const app = { ...definition, globalData: { ...definition.globalData } }
      global.getApp = () => app
      api.request = async (path, options) => {
        assert.equal(path, '/auth/login')
        assert.equal(options.anonymous, true)
        submitted = options.data.code
        return { token: 'test-token', expires_at: 4102444800, user: { id: 1 } }
      }
      await app.login()
      assert.equal(submitted, devLogin ? `dev:${config.DEV_ACCOUNT}` : 'real-wechat-code')
      assert.equal(app.globalData.token, 'test-token')
      const before = app.globalData
      api.request = async () => { throw new Error('本地调试登录未开启') }
      await assert.rejects(app.login(), /本地调试登录未开启/)
      assert.equal(app.globalData, before)
    }
    assert.equal(wechatCalls, 2)
    assert.equal(saved.length, 2)
    assert.ok(saved.every(entry => entry.key.startsWith('palmSession:local:')))
  } finally { config.DEV_LOGIN = oldFlag; api.request = oldRequest }
})


test('custom navigation registers four real tabs and keeps editor as an action', () => {
  const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'../miniprogram')
  const config=JSON.parse(fs.readFileSync(path.join(root,'app.json')))
  assert.equal(config.tabBar.custom,true)
  assert.deepEqual(config.tabBar.list.map(row=>row.pagePath),['pages/ledger/index','pages/items/index','pages/statistics/index','pages/me/index'])
  assert.ok(config.pages.includes('pages/insights/index'))
  for(const row of config.tabBar.list){
    const png=fs.readFileSync(path.join(root,row.iconPath))
    assert.ok(png.readUInt32BE(16)>=26);assert.ok(png.readUInt32BE(20)>=26)
    assert.ok(png.length<40*1024)
  }
})

function photoHarness() {
  const h = profileHarness(), page = h.page('editor')
  global.getCurrentPages = () => [page]
  const sheets = [], selections = [], crops = []
  wx.showActionSheet = options => sheets.push(options)
  wx.chooseMedia = options => selections.push(options)
  wx.cropImage = options => crops.push(options)
  wx.canIUse = () => true
  return { ...h, editor: page, sheets, selections, crops }
}

test('photo picker explicitly selects album or camera, blocks duplicates and does not upload', async () => {
  const h = photoHarness(), page = h.editor
  const pending = page.choosePhoto()
  await page.choosePhoto(); await page.save()
  assert.equal(h.sheets.length, 1)
  assert.deepEqual(h.sheets[0].itemList, ['从相册选择', '拍一张照片'])
  assert.equal(h.requests.length, 0)
  h.sheets[0].success({ tapIndex: 1 })
  await tick()
  assert.deepEqual(h.selections[0].sourceType, ['camera'])
  assert.equal(h.selections[0].camera, 'back')
  assert.equal(h.selections[0].count, 1)
  // A native camera screen can hide the page, without changing the page stack.
  page.onHide()
  h.selections[0].success({ tempFiles: [{ tempFilePath: 'camera.jpg' }] })
  await pending
  page.onShow()
  assert.equal(page.data.previewPath, 'camera.jpg')
  assert.equal(page.data.photoPath, 'camera.jpg')
  const album = page.choosePhoto()
  h.sheets[1].success({ tapIndex: 0 }); await tick()
  assert.deepEqual(h.selections[1].sourceType, ['album'])
  h.selections[1].success({ tempFiles: [{ tempFilePath: 'album.jpg' }] })
  await album
  assert.equal(page.data.photoPath, 'album.jpg')
  assert.equal(page.data.photoBusy, false)
  assert.equal(h.requests.length, 0)
})

test('photo cancellation and permission failure keep the previous image; old callbacks are ignored', async () => {
  const h = photoHarness(), page = h.editor
  page.setData({ photoPath: 'previous.jpg', previewPath: 'previous.jpg' })
  const cancelled = page.choosePhoto()
  h.sheets[0].fail({ errMsg: 'showActionSheet:fail cancel' })
  await cancelled
  assert.equal(page.data.photoError, '')
  const denied = page.choosePhoto()
  h.sheets[1].success({ tapIndex: 1 }); await tick()
  h.selections[0].fail({ errMsg: 'chooseMedia:fail auth deny' })
  await denied
  assert.match(page.data.photoError, /权限/)
  assert.equal(page.data.photoPath, 'previous.jpg')
  const old = page.choosePhoto()
  h.sheets[2].success({ tapIndex: 0 }); await tick()
  global.getCurrentPages = () => [{ route: 'pages/items/index' }]
  page.onHide()
  h.selections[1].success({ tempFiles: [{ tempFilePath: 'late.jpg' }] })
  await old
  assert.equal(page.data.photoPath, 'previous.jpg')
  assert.equal(page.data.photoBusy, false)
  const switched = photoHarness(), other = switched.editor
  const late = other.choosePhoto()
  switched.sheets[0].success({ tapIndex: 1 }); await tick()
  switched.app.globalData.token = 'bob-session'
  other.onShow()
  switched.selections[0].success({ tempFiles: [{ tempFilePath: 'alice-photo.jpg' }] })
  await late
  assert.equal(other.data.photoPath, '')
  assert.equal(other.data.previewPath, '')
  assert.match(other.data.error, /账户已切换/)
})

test('crop uses square selection, keeps images on cancel or failure, and uploads only the final edited file', async () => {
  const h = photoHarness(), page = h.editor, uploads = []
  wx.uploadFile = options => uploads.push(options)
  page.setData({ photoPath: 'original.jpg', previewPath: 'original.jpg' })
  const crop = page.cropPhoto()
  assert.equal(h.crops[0].cropScale, '1:1')
  assert.equal(h.crops[0].src, 'original.jpg')
  h.crops[0].success({ tempFilePath: 'cropped.jpg' })
  await crop
  const cancelled = page.cropPhoto()
  h.crops[1].fail({ errMsg: 'cropImage:fail cancel' })
  await cancelled
  assert.equal(page.data.photoPath, 'cropped.jpg')
  assert.equal(page.data.photoError, '')
  wx.canIUse = () => false
  await page.cropPhoto()
  assert.match(page.data.photoError, /不支持裁剪/)
  assert.equal(page.data.photoPath, 'cropped.jpg')
  const save = page.save()
  await tick()
  h.respond(0, { id: 25 }); await tick()
  assert.equal(uploads[0].filePath, 'cropped.jpg')
  uploads[0].success({ statusCode: 200, data: '{}' })
  await save
  assert.deepEqual(h.navigation, [['navigateBack', undefined]])
})

test('existing photo reads are preview-only, failures can retry and save does not replace a photo', async () => {
  const h = photoHarness(), page = h.editor, downloads = [], uploads = []
  wx.downloadFile = options => downloads.push(options)
  wx.uploadFile = options => uploads.push(options)
  page.itemId = 31
  const loaded = page.load()
  h.respond(0, { id: 31, name: '旧照片', category: '收藏', icon_type: 'other', purchase_date: '2026-01-01',
    purchase_price: '20.00', notes: '', status: 'active', photo_url: '/photo' })
  await loaded
  await tick(); downloads[0].fail(); await tick()
  assert.match(page.data.photoError, /不会删除原照片/)
  const retry = page.loadPhoto()
  await tick(); downloads[1].success({ statusCode: 200, tempFilePath: 'existing.jpg' })
  await retry
  assert.equal(page.data.previewPath, 'existing.jpg')
  assert.equal(page.data.photoPath, '')
  const save = page.save()
  h.respond(1, { id: 31 }); await save
  assert.equal(uploads.length, 0)
  assert.equal(h.requests[1].method, 'PUT')
  // Reordered original-photo download cannot overwrite a new selection.
  const reordered = photoHarness(), editor = reordered.editor, pending = []
  wx.downloadFile = options => pending.push(options)
  editor.setData({ hasPhoto: true, form:{...editor.data.form,cover_mode:'photo'} }); editor.itemId = 32
  const read = editor.loadPhoto()
  const choose = editor.choosePhoto()
  reordered.sheets[0].success({ tapIndex: 0 }); await tick()
  reordered.selections[0].success({ tempFiles: [{ tempFilePath: 'new.jpg' }] }); await choose
  await tick(); pending[0].success({ statusCode: 200, tempFilePath: 'old.jpg' }); await read
  assert.equal(editor.data.previewPath, 'new.jpg')
})

test('rotation scales without upsampling, swaps axes and applies all EXIF orientations before clockwise turn', async () => {
  const { rotationSize, orientationMatrix, rotatePhoto } = require('../miniprogram/utils/photo-edit')
  assert.deepEqual(rotationSize(4000, 3000), { width: 960, height: 1280, scale: .32, orientedHeight: 3000 })
  assert.deepEqual(rotationSize(600, 800), { width: 800, height: 600, scale: 1, orientedHeight: 800 })
  assert.deepEqual(rotationSize(4000, 3000, 'right'), { width: 1280, height: 960, scale: .32, orientedHeight: 4000 })
  for (const direction of ['up', 'up-mirrored', 'down', 'down-mirrored', 'left-mirrored', 'right', 'right-mirrored', 'left']) {
    const [a,b,c,d,e,f] = orientationMatrix(600, 800, direction)
    const size = rotationSize(600, 800, direction)
    const corners = [[0,0], [600,0], [0,800], [600,800]].map(([x,y]) => [size.orientedHeight - (b*x+d*y+f), a*x+c*y+e])
    assert.equal(Math.min(...corners.map(row => row[0])), 0)
    assert.equal(Math.max(...corners.map(row => row[0])), size.width)
    assert.equal(Math.min(...corners.map(row => row[1])), 0)
    assert.equal(Math.max(...corners.map(row => row[1])), size.height)
  }
  const draws = [], outputs = []
  const context = Object.fromEntries(['fillRect', 'scale', 'translate', 'rotate', 'transform', 'drawImage'].map(name => [name, (...args) => draws.push([name, ...args])]))
  const canvas = { getContext: () => context, createImage() { return { set src(value) { this.path = value; this.onload() } } } }
  global.wx = {
    getImageInfo(options) { options.success(options.src === 'original.jpg'
      ? {width:4000,height:3000,orientation:'up',path:options.src}
      : options.src === 'resized.jpg' ? {width:1280,height:960,orientation:'up',path:options.src}
        : {width:960,height:1280,orientation:'up',type:'jpeg',path:options.src}) },
    canIUse:()=>true,
    compressImage(options) { options.success({tempFilePath:'resized.jpg'}) },
    getFileSystemManager:()=>({stat(o){o.success({stats:{size:10000}})},unlink(o){o.complete?.()}}),
    createSelectorQuery() { return { in() { return this }, select(id) { assert.equal(id, '#photo-edit-canvas'); return this },
      fields(options, callback) { this.callback = callback; return this }, exec() { this.callback({ node: canvas }) } } },
    canvasToTempFilePath(options) { outputs.push(options); options.success({ tempFilePath: 'rotated.jpg' }) }
  }
  assert.equal(await rotatePhoto({}, 'original.jpg'), 'rotated.jpg')
  assert.equal(canvas.width, 1); assert.equal(canvas.height, 1)
  assert.equal(outputs[0].fileType, 'jpg'); assert.equal(outputs[0].quality, .82)
  assert.deepEqual(draws.slice(0,5), [['fillRect', 0,0,960,1280], ['scale', 1,1], ['translate',960,0],
    ['rotate',Math.PI/2], ['transform',1,0,0,1,0,0]])
})


test('rotation failure and unloaded media callbacks keep the previous photo', async () => {
  const h = photoHarness(), page = h.editor
  page.setData({ photoPath: 'before.jpg', previewPath: 'before.jpg' })
  wx.getImageInfo = options => options.fail({ errMsg: 'getImageInfo:fail decode' })
  await page.rotatePhoto()
  assert.equal(page.data.photoPath, 'before.jpg')
  assert.match(page.data.photoError, /处理失败/)
  assert.equal(page.data.photoBusy, false)
  const pending = page.choosePhoto()
  h.sheets[0].success({ tapIndex: 0 }); await tick()
  page.onUnload()
  const snapshot = structuredClone(page.data)
  h.selections[0].success({ tempFiles: [{ tempFilePath: 'late.jpg' }] })
  await pending
  assert.deepEqual(page.data, snapshot)
})
