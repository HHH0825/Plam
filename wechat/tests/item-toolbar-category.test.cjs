const test = require('node:test'), assert = require('node:assert/strict')
require('./local-config.cjs')
const api = require('../miniprogram/utils/api'), config = require('../miniprogram/config')
const category = require('../miniprogram/pages/editor/lib/item-category'), view = require('../miniprogram/utils/view')
const { serviceScope } = require('../miniprogram/utils/cloud-transport')
const { createItemListPage } = require('../miniprogram/utils/item-list-page')
const tick = () => new Promise(r => setImmediate(r))
function dataPage(definition) {
  return { ...definition, data: structuredClone(definition.data), setData(patch, cb) {
    for (const [key, value] of Object.entries(patch)) {
      const keys = key.split('.'); let target = this.data
      while (keys.length > 1) { const k = keys.shift(); target = target[k] ?? (target[k] = {}) }
      target[keys[0]] = value
    }
    cb?.()
  } }
}
function runtime() {
  const original = api.request, app = { globalData: { token: 'toolbar-A', user: { id: 7 } }, requireSession: () => true }
  const storage = new Map(), calls = [], back = [], cache = { sync() {}, release() {} }
  global.getApp = () => app; global.wx = { getStorageSync: k => storage.get(k), setStorageSync: (k,v) => storage.set(k,v),
    removeStorageSync: k => storage.delete(k), hideKeyboard() {}, navigateBack: () => back.push(true), getFileSystemManager: () => ({}) }
  let definition; global.Page = p => definition = p
  delete require.cache[require.resolve('../miniprogram/pages/editor/index')]; require('../miniprogram/pages/editor/index')
  const p = dataPage(definition); global.getCurrentPages = () => [p]
  Object.assign(p, { _alive: true, _visible: true, _token: app.globalData.token, _sequence: 0, _photoSequence: 0, _photos: cache, _photoOwner: {}, itemId: 0 })
  p.setData({ paymentReady: true, coverSupported: true })
  const old = { id: 12, name: '相机', category: '摄影器材', icon_type: 'digital', purchase_price: '10.00',
    purchase_date: '2026-01-01', status: 'active', revision: 3, notes: '', cover_mode: 'icon', cover_icon_key: 'camera' }
  api.request = async (path, options = {}) => {
    if (!options.method) return path === '/items/12' ? old : path.startsWith('/wishlist/') ? {name:'相机心愿',category:'摄影器材',expected_price:'10.00',status:'considering',revision:2} : []
    calls.push({ path, ...options }); storage.clear()
    return { ...old, ...options.data, revision: 4 }
  }
  return { p, old, app, storage, calls, back, cache, restore() { clearTimeout(p._draftTimer); api.request = original } }
}
test('one selector maps all nine categories without replacing selected covers or photographs', () => {
  const h = runtime()
  try {
    assert.equal(h.p.data.form.category, '其他')
    h.p.setData({ 'form.cover_icon_key': 'camera', photoPath: 'kept.jpg' })
    view.TYPE_OPTIONS.forEach(([key, label], i) => {
      h.p.typeChange({ detail: { value: i } })
      assert.equal(h.p.data.form.icon_type, key); assert.equal(h.p.data.form.category, label)
      assert.equal(h.p.data.form.cover_icon_key, 'camera'); assert.equal(h.p.data.photoPath, 'kept.jpg')
    })
    assert.equal(category.normalize({icon_type:'invalid',category:'旧类'}).category, '其他')
  } finally { h.restore() }
})
test('loading old custom categories is read-only; saving uses the selected preset and preserves failures', async () => {
  const h = runtime()
  try {
    h.p.itemId = 12; await h.p.load()
    assert.equal(h.p.data.form.category, '数码'); assert.equal(h.old.category, '摄影器材'); assert.equal(h.calls.length, 0)
    assert.equal(h.p.data.form.cover_icon_key, 'camera')
    api.request = async () => { throw Error('save offline') }; await h.p.save()
    assert.equal(h.p.data.form.category, '数码'); assert.equal(h.p.data.form.name, '相机'); assert.match(h.p.data.error, /offline/)
  } finally { h.restore() }
})
test('an unknown old create is replayed unchanged before a fresh normalized update', async () => {
  const h = runtime()
  try {
    h.p.setData({ form: { ...h.p.data.form, name: '相机', category: '数码', icon_type: 'digital', purchase_price: '10.00' } })
    const original = { ...h.p.data.form, category: '摄影器材', warranty_expires_on: null }; delete original.payment_info
    const key = `palmLocalRequests:${serviceScope()}:7`
    h.storage.set(key, { [JSON.stringify(['POST','/items',original,null])]: { id: 'original-receipt' } })
    await h.p.save()
    assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].data, original)
    assert.equal(h.p.itemId, 12); assert.equal(h.back.length, 0); assert.match(h.p.data.error, /再次保存/)
    await h.p.save(); assert.equal(h.calls[1].path, '/items/12'); assert.equal(h.calls[1].method, 'PUT')
    assert.equal(h.calls[1].data.category, '数码'); assert.equal(h.back.length, 1)
  } finally { h.restore() }
})
test('pending category recovery is account scoped and rejects multiple matching originals', () => {
  const h = runtime(), transport = config.API_TRANSPORT
  try {
    config.API_TRANSPORT = 'cloud_http_function'
    const payload = { name:'相机', icon_type:'digital', category:'数码' }, original = {...payload,category:'摄影器材'}
    const key = `palmRequests:${serviceScope()}:7`, context = { method:'POST',path:'/items' }
    h.storage.set(key, {version:1,rows:{[JSON.stringify(['POST','/items',original])]:{id:'receipt'}}})
    assert.deepEqual(category.submission(payload,context).payload,original)
    h.app.globalData.user.id=8; assert.equal(category.submission(payload,context).legacyCategory,false)
    h.app.globalData.user.id=7; h.storage.get(key).rows[JSON.stringify(['POST','/items',{...original,category:'摄影收藏'}])] = {id:'other'}
    assert.throws(() => category.submission(payload,context), /多个未确认/)
    assert.deepEqual(category.submission(payload,{...context,photoSnapshot:JSON.stringify(original)}).payload,original)
  } finally { config.API_TRANSPORT=transport; h.restore() }
})
test('search collapses without losing text; clearing it preserves filters and archive behavior', () => {
  const h = runtime()
  try {
    const p = dataPage(createItemListPage()); p.apply = () => {}; p.setData({status:'idle',category:'数码',query:'相机'})
    p.toggleSearch(); assert.equal(p.data.searchFocus,true); p.toggleSearch(); assert.equal(p.data.searchOpen,false)
    assert.equal(p.data.query,'相机'); p.clearSearch(); assert.equal(p.data.query,''); assert.equal(p.data.status,'idle'); assert.equal(p.data.category,'数码')
    const archive=dataPage(createItemListPage('disposed')); archive.toggleSearch(); assert.equal(archive.data.searchOpen,false)
  } finally { h.restore() }
})
test('account switch clears search and filters; wishlist conversion starts with a preset category', async () => {
  const h = runtime()
  try {
    const p=dataPage(createItemListPage()); Object.assign(p,{_photos:h.cache,_photoOwner:{},_sequence:0,_token:'old-owner'})
    p.setData({query:'别人的搜索',searchOpen:true,category:'旧分类'}); p.onShow(); await tick()
    assert.equal(p.data.query,''); assert.equal(p.data.searchOpen,false); assert.equal(p.data.category,'')
    require('../miniprogram/utils/display-cache').clear();const request=api.request;api.request=(path,options)=>path==='/items'?Promise.resolve([h.old]):request(path,options)
    p.setData({query:'相机',searchOpen:true,category:'摄影器材',sortIndex:4});p._scroll=145;p._anchor={id:12,index:0,offset:10}
    p.onHide();p.onShow();await tick()
    assert.equal(p.data.query,'相机');assert.equal(p.data.category,'摄影器材');assert.equal(p.data.sortIndex,4)
    assert.equal(p.data.searchOpen,true);assert.equal(p.data.searchFocus,false);assert.equal(p._scroll,145);assert.equal(p._anchor.id,12)
    h.p.wishId=42; await h.p.initWish(); assert.equal(h.p.data.form.category,'其他'); assert.equal(h.p.data.form.name,'相机心愿')
  } finally { h.restore() }
})
