const { syncTabBar, setTabBarHidden } = require('./tab-bar')
const api = require('./api')
const view = require('./view')
const collection = require('./collection')
const metricLayout = require('./metric-layout')
const { navigate, resetNavigation } = require('./navigation')
const listMemories = { held: null, disposed: null }

// Shared lifecycle keeps photo loading and return positioning identical across both lists.
function createItemListPage(scope = 'held') {
 const isArchive = scope === 'disposed'
 const initial = () => ({ isArchive, metricLayouts: {}, items: [], shown: [], query: '', status: '', statusIndex: 0, category: '', categoryIndex: 0,
  categories: ['全部分类'], layout: 'list', sortIndex: 0, searchOpen: false, searchFocus: false,
  sortOptions: isArchive ? ['最近添加', '曾持有最久', '购买价格从高到低', '历史日均净成本从高到低', '历史日均净成本从低到高'] : collection.SORTS,
  photoPaths: {}, photoStates: {}, artErrors: {}, statusOptions: ['全部持有', '使用中', '闲置'],
  sortLabels: ['最近添加', isArchive ? '曾持有最久' : '持有最久', '价格 ↓', '净成本/天 ↓', '净成本/天 ↑'],
  decorError: false, heroArtError: false, entriesStacked: false, entryIconErrors: {}, filterOpen: false, draftStatusIndex: 0, draftCategoryIndex: 0, draftCategories: [], filterCount: 0, loading: true, error: '' })
 return {
  data: initial(),
  onLoad() { this._sequence = 0; this._scroll = 0; this._anchor = null; this._photoOwner = {}; this._photos = api.photoCache() },
  onReady() { this.measureEntryLayout() },
  onResize() { this.measureEntryLayout(); metricLayout.measure(this) },
  measureEntryLayout() {
   if (isArchive || !wx.createSelectorQuery || !this._visible) return
   const attempt = {}; this._entryMeasure = attempt
   try {
    wx.createSelectorQuery().in(this).select('.purchase-entries').boundingClientRect().selectAll('.purchase-entry-label').boundingClientRect().exec(result => {
     if (this._entryMeasure !== attempt || !this._visible) return
     const row = result && result[0], labels = result && result[1]
     if (!row || !labels || labels.length !== 3) return
     const available = (row.width - 16) / 3
     const entriesStacked = row.width < 339 || labels.some(label => label.width + 22 + 5 + 18 > available + 0.5)
     if (entriesStacked !== this.data.entriesStacked) this.setData({ entriesStacked })
    })
   } catch (_) { /* CSS supplies the narrow-screen fallback. */ }
  },
  onShow() {
   if (!isArchive) syncTabBar(this)
   this._visible = true; resetNavigation(this)
   if (!getApp().requireSession()) { this.setData(initial()); return }
   const token = getApp().globalData.token
   if (this._token !== token) {
    this._token = token; this._scroll = 0; this._anchor = null
    this.setData({ ...initial(), ...collection.preferences(getApp().globalData.user, scope) })
    const memory = listMemories[scope]
    if (memory && memory.token === token) {
     this._scroll = memory.scroll; this._anchor = memory.anchor
     this.setData(memory.filters)
    } else listMemories[scope] = null
   }
   this.measureEntryLayout(); this.load(true)
  },
  onPageScroll(e) { this._scroll = e.scrollTop },
  onHide() {
   this.rememberFilters(); this.closeFilters(); this._visible = false; this._sequence++; this.disconnectPhotos(); this._photos.release(this._photoOwner)
   const photoStates = Object.fromEntries(Object.entries(this.data.photoStates).filter(([, state]) => state !== 'loading'))
   this.setData(getApp().globalData.token === this._token ? { photoStates, searchFocus: false } : initial())
  },
  onUnload() { this.rememberFilters(); this.closeFilters(); this._visible = false; this._sequence++; this.disconnectPhotos(); this._photos.release(this._photoOwner) },
  rememberFilters() {
   if (!this._token || this._token !== getApp().globalData.token) { listMemories[scope] = null; return }
   const { query, status, statusIndex, category } = this.data
   listMemories[scope] = { token: this._token, scroll: this._scroll, anchor: this._anchor, filters: { query, status, statusIndex, category } }
  },
  current(seq, token) { return seq === this._sequence && this._visible && getApp().globalData.token === token },
  disconnectPhotos() {
   if (this._observer) this._observer.disconnect()
   if (this._nearObserver) this._nearObserver.disconnect()
   this._observer = null; this._nearObserver = null
  },
  async load(reuse = false) {
   if(getApp().globalData.localMode)return require('./local-item-list').load(this,scope)
   const seq = ++this._sequence, token = getApp().globalData.token
   this._validatedPhotos = new Set(); this.disconnectPhotos(); this._photos.release(this._photoOwner)
   this.setData({ loading: !this.data.items.length, error: '', photoStates: Object.fromEntries(Object.entries(this.data.photoStates).filter(([, state]) => state !== 'loading')) })
   try {
    const allItems = (await (reuse === true ? require('./display-cache').read('/items') : api.request('/items'))).map(view.decorate)
    if (!this.current(seq, token)) return
    // Synchronize the full response: this cache is shared by both list scopes.
    this._photos.sync(allItems, true)
    const items = collection.inScope(allItems, scope)
    const retained = items.filter(item => item.photo_url && this.data.items.some(old => old.id === item.id && old.photo_version === item.photo_version))
    let photoPaths = Object.fromEntries(retained.filter(item => this.data.photoPaths[item.id]).map(item => [item.id, this.data.photoPaths[item.id]]))
    let photoStates = Object.fromEntries(retained.filter(item => this.data.photoStates[item.id] && this.data.photoStates[item.id] !== 'loading').map(item => [item.id, this.data.photoStates[item.id]]))
    if (api.photosAvailable && !api.photosAvailable()) { photoPaths = {}; photoStates = Object.fromEntries(items.filter(i => i.photo_url).map(i => [i.id, 'unavailable'])) }
    const categories = ['全部分类', ...new Set(items.map(i => i.category).sort())]
    const category = categories.includes(this.data.category) ? this.data.category : ''
    require('./display-cache').present(this,{ items, categories, category, categoryIndex: category ? categories.indexOf(category) : 0, loading: false, photoPaths, photoStates, artErrors: {} })
    this.apply(true)
   } catch (error) { if (this.current(seq, token)) this.setData({ loading: false, error: view.errorMessage(error) }) }
  },
  apply(restore = false) {
   if(getApp().globalData.localMode&&!restore)return this.load()
   const seq = this._sequence, token = getApp().globalData.token
   this.disconnectPhotos()
   require('./display-cache').present(this,{ filterCount: Number(!isArchive && !!this.data.status) + Number(!!this.data.category), shown: collection.select(collection.inScope(this.data.items, scope), this.data.query, isArchive ? '' : this.data.status, this.data.category, this.data.sortIndex) }, () => {
    if (!this.current(seq, token)) return
    metricLayout.measure(this, false, () => { this.observePhotos(); if (restore) this.restorePosition() })
   })
  },
  rememberPosition(done) {
   if (!wx.createSelectorQuery) { if (done) done(); return }
   const seq = this._sequence, token = getApp().globalData.token, attempt = {}; this._positionAttempt = attempt
   let finished = false
   const finish = rects => {
    if (finished) return
    finished = true; clearTimeout(timer)
    if (this._positionAttempt !== attempt || !this.current(seq, token)) return
    const first = (rects || []).find(r => r.bottom > 0)
    const id = first && (first.dataset && first.dataset.id || (String(first.id || '').match(/^item-(\d+)$/) || [])[1])
    if (id) this._anchor = { id, offset: first.top, index: this.data.shown.findIndex(i => i.id === Number(id)) }
    if (done) done()
   }
   const timer = setTimeout(() => finish(), 150)
   try { wx.createSelectorQuery().in(this).selectAll('.item-card').boundingClientRect(finish).exec() } catch (_) { finish() }
  },
  restorePosition() {
   if (!wx.createSelectorQuery || !wx.pageScrollTo) return
   const seq = this._sequence, token = getApp().globalData.token, anchor = this._anchor
   const id = anchor && (this.data.shown.some(i => i.id === Number(anchor.id)) ? anchor.id : (this.data.shown[Math.min(anchor.index, this.data.shown.length - 1)] || {}).id)
   const q = wx.createSelectorQuery().in(this)
   q.select(id ? '#item-' + id : '.page').boundingClientRect(); q.selectViewport().scrollOffset()
   q.exec(results => {
    if (!this.current(seq, token)) return
    const rect = results && results[0], viewport = results && results[1]
    const top = id && rect && viewport ? viewport.scrollTop + rect.top - anchor.offset : this._scroll
    wx.pageScrollTo({ scrollTop: Math.max(0, top || 0), duration: 0 })
   })
  },
  observePhotos() {
   if (api.photosAvailable && !api.photosAvailable()) return
   this.disconnectPhotos(); this._photos.release(this._photoOwner)
   const photoStates = Object.fromEntries(Object.entries(this.data.photoStates).filter(([, state]) => state !== 'loading'))
   this.setData({ photoStates })
   if (!this._visible || !wx.createIntersectionObserver || !this.data.shown.some(i => i.photo_url)) return
   const seq = this._sequence, token = getApp().globalData.token
   this._observer = wx.createIntersectionObserver(this, { observeAll: true })
   this._observer.relativeToViewport().observe('.photo-target', e => { if (e.intersectionRatio > 0 && this.current(seq, token)) this.readPhoto(Number(e.dataset.id), 0) })
   let height = 700
   try { height = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).windowHeight || height } catch (_) {}
   this._nearObserver = wx.createIntersectionObserver(this, { observeAll: true })
   this._nearObserver.relativeToViewport({ bottom: height }).observe('.photo-target', e => { if (e.intersectionRatio > 0 && this.current(seq, token)) this.readPhoto(Number(e.dataset.id), 1) })
  },
  readPhoto(id, priority = 0, retry = false) {
   const item = this.data.shown.find(row => row.id === id)
   if (!item || !item.photo_url || !this._visible) return
   if (api.photosAvailable && !api.photosAvailable()) { this.setData({ ['photoPaths.' + id]: '', ['photoStates.' + id]: 'unavailable' }); return }
   if (this.data.photoStates[id] === 'loading') { if (!priority) this._photos.promote(id, this._photoOwner); return }
   if (!retry && this.data.photoStates[id] === 'error') return
   if (!retry && this.data.photoPaths[id]) {
    if (this._validatedPhotos && this._validatedPhotos.has(id)) return
    if (!this._validatedPhotos) this._validatedPhotos = new Set()
    this._validatedPhotos.add(id)
    const seq = this._sequence, token = getApp().globalData.token
    this._photos.peek(item).then(path => { if (!path && this.current(seq, token)) { this.setData({ ['photoPaths.' + id]: '', ['photoStates.' + id]: '' }); this.readPhoto(id, priority) } }).catch(() => {})
    return
   }
   const seq = this._sequence, token = getApp().globalData.token
   this.setData({ ['photoStates.' + id]: 'loading' })
   this._photos.load(item, this._photoOwner, 'thumb', priority).then(path => { if (this.current(seq, token)) this.setData({ ['photoPaths.' + id]: path, ['photoStates.' + id]: 'ready' }) }).catch(error => { if (!error.cancelled && this.current(seq, token)) this.setData({ ['photoStates.' + id]: 'error' }) })
  },
  retryPhoto(e) { this.readPhoto(Number(e.currentTarget.dataset.id), 0, true) },
  photoFailed(e) {
   const id = Number(e.currentTarget.dataset.id); this._photos.invalidate(id)
   this.setData({ ['photoPaths.' + id]: '', ['photoStates.' + id]: api.photosAvailable && !api.photosAvailable() ? 'unavailable' : 'error' })
  },
  artFailed(e) { const id=Number(e.currentTarget.dataset.id),item=this.data.items.find(i=>i.id===id);if(item&&item.art!==item.fallbackArt){this.setData({items:this.data.items.map(i=>i.id===id?{...i,art:i.fallbackArt}:i)});this.apply()}else this.setData({ ['artErrors.' + id]: true }) },
  decorFailed() { if (!this.data.decorError) this.setData({ decorError: true }) },
  heroArtFailed() { this.setData({ heroArtError: true }) },
  openFilters() {
   if (!isArchive) { wx.hideKeyboard?.(); this.setData({ searchFocus: false }) }
   this._filterToken = getApp().globalData.token
   this.setData({ filterOpen: true, draftStatusIndex: this.data.statusIndex, draftCategoryIndex: this.data.categoryIndex, draftCategories: this.data.categories.slice() })
   if (!isArchive) setTabBarHidden(this, true)
  },
  closeFilters() {
   if (!this.data.filterOpen) return
   require('./motion').leave(this,'filterOpen',()=>{this._filterToken = null;this.setData({ filterOpen: false, draftStatusIndex: 0, draftCategoryIndex: 0, draftCategories: [] });if (!isArchive) setTabBarHidden(this, false)})
  },
  chooseDraftStatus(e) { this.setData({ draftStatusIndex: Number(e.currentTarget.dataset.index) }) },
  chooseDraftCategory(e) { this.setData({ draftCategoryIndex: Number(e.currentTarget.dataset.index) }) },
  resetDraftFilters() { this.setData({ draftStatusIndex: 0, draftCategoryIndex: 0 }) },
  applyFilters() {
   if (!this.data.filterOpen || this._filterToken !== getApp().globalData.token) { this.closeFilters(); return }
   const statusIndex = !isArchive && [0, 1, 2].includes(this.data.draftStatusIndex) ? this.data.draftStatusIndex : 0
   const selected = this.data.draftCategories[this.data.draftCategoryIndex]
   const category = this.data.draftCategoryIndex && this.data.categories.includes(selected) ? selected : ''
   this._anchor = null; this._scroll = 0
   this.setData({ statusIndex, status: ['', 'active', 'idle'][statusIndex] || '', category, categoryIndex: category ? this.data.categories.indexOf(category) : 0 })
   this.closeFilters(); this.apply()
  },
  stopSheetTouch() {},
  toggleSearch() {
   if (isArchive) return
   const searchOpen = !this.data.searchOpen
   this.setData({ searchOpen, searchFocus: searchOpen })
   if (!searchOpen) wx.hideKeyboard?.()
  },
  clearSearch() { this._anchor = null; this._scroll = 0; this.setData({ query: '' }); this.apply() },
  search(e) { this._anchor = null; this._scroll = 0; this.setData({ query: e.detail.value }); this.apply() },
  statusChange(e) {
   const value = Number(e.detail.value), index = !isArchive && [0, 1, 2].includes(value) ? value : 0
   this._anchor = null; this._scroll = 0; this.setData({ statusIndex: index, status: ['', 'active', 'idle'][index] }); this.apply()
  },
  categoryChange(e) { const index = Number(e.detail.value); this._anchor = null; this._scroll = 0; this.setData({ categoryIndex: index, category: index ? this.data.categories[index] : '' }); this.apply() },
  clearFilters() { this._anchor = null; this._scroll = 0; this.setData({ query: '', status: '', statusIndex: 0, category: '', categoryIndex: 0 }); this.apply() },
  sortChange(e) {
   const index = Number(e.detail.value); this.setData({ sortIndex: Number.isInteger(index) && index >= 0 && index < this.data.sortOptions.length ? index : 0 })
   collection.savePreferences(getApp().globalData.user, this.data, scope); this._anchor = null; this._scroll = 0; this.apply()
  },
  open(e) { const id = e.currentTarget.dataset.id; this.rememberPosition(() => navigate(this, '/pages/item/index?id=' + id)) },
  backToItems() { wx.switchTab({ url: '/pages/items/index' }) },
  wishlist() { navigate(this, '/pages/wishlist/index') },
  entryIconFailed(e) { const key = e.currentTarget.dataset.key; if (['wishlist', 'subscription', 'storage', 'filter', 'sort'].includes(key)) this.setData({ ['entryIconErrors.' + key]: true }) },
  expenses() { navigate(this, '/pages/fixed-expenses/index') },
  locations() { this.rememberPosition(() => navigate(this, '/pages/storage-locations/index')) },
  add() { this.rememberPosition(() => navigate(this, '/pages/editor/index')) },
  onPullDownRefresh() { require('./display-cache').clear();return this.load().finally(() => wx.stopPullDownRefresh()) }
  ,loadMore(){if(getApp().globalData.localMode)return require('./local-item-list').load(this,scope,true)},
  onReachBottom(){return this.loadMore()}
 }
}
module.exports = { createItemListPage }
