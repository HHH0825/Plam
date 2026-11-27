const api = require('../../utils/api')
const view = require('../../utils/view')
const { navigate, resetNavigation } = require('../../utils/navigation')
const runtime = require('../../local-core/runtime')
const initial = () => ({ locations: [], items: [], shownLocations: [], shownItems: [], locationId: null,
  locationName: '', query: '', itemQuery: '', mode: 'locations', picking: false, selecting: false,
  chosen: {}, chosenCount: 0, naming: false, renameId: null, nameDraft: '', loading: true, ready: false,
  targetOpen: false, targetQuery: '', targets: [], assignItemId: null, busy: false, error: '', unavailable: false, conflict: false, photoPaths: {}, photoErrors: {}, unassigned: 0 })
const routeId = value => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
function createStorageLocationsPage({ onStateChange } = {}) {
  return {
    data: initial(),
    update(patch, callback) {
      this.setData(patch, callback)
      onStateChange?.(this)
    },
    localScope() {
      return getApp().globalData.localMode ? runtime.scope() : ''
    },
    onLoad(options = {}) {
      this.options = options
      this._token = getApp().globalData.token
      this._seq = 0
      this._visible = false
      this._photos = api.photoCache()
      this._owner = {}
      if (options.locationId !== undefined) this.update({ mode: 'items', locationId: routeId(options.locationId) })
      this.assignItemId = routeId(options.assignItemId)
      this.update({ assignItemId: this.assignItemId })
    },
    onShow() {
      this._visible = true
      resetNavigation(this)
      if (this._token !== getApp().globalData.token) {
        this._locked = true
        this._seq++
        this._photos.release(this._owner)
        this.update({ ...initial(), loading: false, error: '账户已切换，请重新打开收纳位置。' })
        return
      }
      return this.load()
    },
    suspend() {
      this._visible = false
      this._seq++
      this._confirmation = null
      this._photos.release(this._owner)
    },
    onHide() {
      this.suspend()
      this.update({ busy: false })
    },
    onUnload() { this.suspend() },
    active(seq = this._seq) {
      return !this._locked && this._visible && seq === this._seq && this._token === getApp().globalData.token
    },
    current(seq = this._seq) { return this.active(seq) && this._scope === this.localScope() },
    async load({ retry = false, afterWrite = false } = {}) {
      if (!this.active() || this.data.busy || this._confirmation) return false
      const app = getApp()
      const seq = ++this._seq
      if (this._write && !afterWrite) {
        this.update({ loading: true, ready: false })
        await this._write.finished
        if (!this.active(seq)) return false
      }
      this.update({ loading: true, ready: false, error: '', unavailable: false })
      try {
        if (!app.requireSession()) {
          if (!app.globalData.localMode || !app.ensureSession) return false
          await app.ensureSession({ retry })
          if (!this.active(seq)) return false
        }
        const scope = this.localScope()
        if (this._scope !== undefined && this._scope !== scope) {
          this._photos.release(this._owner)
          this.assignItemId = null
          this._scope = scope
          this.update(initial())
        }
        this._scope = scope
        const [result, items] = await Promise.all([api.request('/storage-locations'), api.request('/items')])
        if (!this.current(seq)) return false
        if (!result || !Array.isArray(result.locations) || !Array.isArray(items)) throw new Error('收纳资料暂时无法读取')
        const live = items.filter(i => i.status === 'active' || i.status === 'idle').map(view.decorate)
        const missing = this.data.locationId && !result.locations.some(l => l.id === this.data.locationId)
        this.update({ locations: result.locations, items: live, unassigned: result.unassigned_count,
          ready: true, loading: false, ...(missing ? { mode: 'locations', locationId: null, picking: false, selecting: false,
            chosen: {}, chosenCount: 0, error: '这个位置已删除，物品仍可在未设置位置中查看。' } : {}) })
        this.apply(); this.readPhotos(seq)
        return true
      } catch (e) {
        if (this.active(seq) && (this._scope === undefined || this.current(seq))) this.update({ loading: false, ready: false, unavailable: e.status === 404,
          error: e.status === 404 ? '收纳位置功能暂不可用，请同步云端版本后重新检查。' : view.errorMessage(e) })
        return false
      }
    },
    apply() {
      const d = this.data, q = d.query.trim().toLowerCase(), iq = d.itemQuery.trim().toLowerCase()
      const location = d.locations.find(l => l.id === d.locationId)
      const shown = (d.picking ? d.items : d.items.filter(i => (i.storage_location_id || null) === d.locationId))
        .filter(i => !iq || (i.name + ' ' + i.category).toLowerCase().includes(iq))
        .map(i => ({ ...i, checked: !!d.chosen[i.id], alreadyHere: d.picking && (i.storage_location_id || null) === d.locationId }))
      this.update({ shownLocations: d.locations.filter(l => !q || l.name.toLowerCase().includes(q)), shownItems: shown,
        locationName: location ? location.name : '未设置位置' })
    },
    search(e) { this.update({ query: e.detail.value }); this.apply() },
    searchItems(e) { this.update({ itemQuery: e.detail.value }); this.apply(); this.readPhotos(this._seq) },
    async readPhotos(seq) {
      const generation = this._photoGeneration = (this._photoGeneration || 0) + 1
      this._photos.release(this._owner); this.update({ photoPaths: {}, photoErrors: {} })
      await Promise.all(this.data.shownItems.filter(i => i.photo_url).map(async item => {
        try { const path = await this._photos.load(item, this._owner, 'thumb'); if (this.current(seq) && generation === this._photoGeneration) this.update({ ['photoPaths.' + item.id]: path }) }
        catch (_) { /* Category illustration remains visible. */ }
      }))
    },
    photoFailed(e) {const id=Number(e.currentTarget.dataset.id);if(this.data.photoPaths[id]&&!this.data.photoErrors[id])this.update({['photoErrors.'+id]:true});else{this.update({items:this.data.items.map(i=>i.id===id?{...i,art:i.art===i.fallbackArt?'':i.fallbackArt}:i)});this.apply()}},
    enter(e) {
      if (!this.data.ready || this.data.busy) return
      const id = Number(e.currentTarget.dataset.id) || null
      if (this.assignItemId) return this.singleMove(id)
      this.update({ locationId: id, mode: 'items', itemQuery: '', picking: false, selecting: false, chosen: {}, chosenCount: 0, error: '', conflict: false })
      this.apply(); this.readPhotos(this._seq)
    },
    groups() { if (this.data.busy) return; this.update({ mode: 'locations', picking: false, selecting: false, chosen: {}, chosenCount: 0, error: '', conflict: false }); this.apply() },
    beginAdd() { if (!this.data.ready || this.data.busy) return; this.update({ picking: true, selecting: true, chosen: {}, chosenCount: 0, itemQuery: '' }); this.apply(); this.readPhotos(this._seq) },
    beginSelect() { if (!this.data.ready || this.data.busy) return; this.update({ selecting: true, chosen: {}, chosenCount: 0 }); this.apply() },
    cancelSelect() { if (this.data.busy) return; this.update({ selecting: false, picking: false, chosen: {}, chosenCount: 0, itemQuery: '', error: '', conflict: false }); this.apply() },
    tapItem(e) {
      if (!this.data.ready || this.data.busy) return
      const id = Number(e.currentTarget.dataset.id), item = this.data.items.find(i => i.id === id)
      if (!item) return
      if (!this.data.selecting) { navigate(this, '/pages/item/index?id=' + id); return }
      if (this.data.picking && (item.storage_location_id || null) === this.data.locationId) return
      const chosen = { ...this.data.chosen }
      if (chosen[id]) delete chosen[id]
      else {
        if (Object.keys(chosen).length >= 50) { wx.showToast({ title: '一次最多选择50件', icon: 'none' }); return }
        chosen[id] = { id, revision: item.revision }
      }
      this.update({ chosen, chosenCount: Object.keys(chosen).length }); this.apply()
    },
    async confirm(title, content) {
      if (this._confirmation || this._write || !this.current() || !this.data.ready) return false
      const owner = {}
      this._confirmation = owner
      const seq = this._seq
      try {
        const result = await new Promise(resolve => wx.showModal({ title, content, success: r => resolve(r.confirm), fail: () => resolve(false) }))
        return result && this.current(seq)
      } finally {
        if (this._confirmation === owner) this._confirmation = null
      }
    },
    async act(action, success) {
      if (!this.current() || this._write || this._confirmation || this.data.busy || !this.data.ready) return
      let finish
      const owner = { finished: new Promise(resolve => { finish = resolve }) }
      this._write = owner
      const seq = this._seq; this.update({ busy: true, error: '', conflict: false })
      try { const result = await action(); if (this.current(seq)) await success(result) }
      catch (e) { if (this.current(seq)) this.update({ error: view.errorMessage(e), conflict: e.status === 409 || e.status === 428 }) }
      finally {
        if (this._write === owner) this._write = null
        finish()
        if (this.current(seq)) this.update({ busy: false })
      }
    },
    newLocation() { if (this.data.ready && !this.data.busy) this.update({ naming: true, renameId: null, nameDraft: '', error: '' }) },
    rename() { const row = this.data.locations.find(l => l.id === this.data.locationId); if (row && !this.data.busy) this.update({ naming: true, renameId: row.id, nameDraft: row.name, error: '' }) },
    nameInput(e) { this.update({ nameDraft: e.detail.value }) },
    cancelName() { if (!this.data.busy) this.update({ naming: false }) },
    saveName() {
      const name = this.data.nameDraft.trim(), id = this.data.renameId
      if (!name || [...name].length > 40) { this.update({ error: '请填写1至40字的位置名称' }); return }
      const duplicate = this.data.locations.find(l => l.name === name && l.id !== id)
      if (duplicate) { this.update({ error: '已有同名位置，请使用已有位置。' }); return }
      const row = this.data.locations.find(l => l.id === id)
      return this.act(() => api.request('/storage-locations' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', data: { name }, ...(row ? { revision: row.revision } : {}) }), async () => {
        this.update({ naming: false, busy: false }); await this.load({ afterWrite: true })
      })
    },
    async remove() {
      const row = this.data.locations.find(l => l.id === this.data.locationId)
      if (!row || this.data.busy || !await this.confirm('删除收纳位置', '其中物品将显示为未设置位置，物品档案不会删除。')) return
      if (this.data.mode !== 'items' || this.data.locationId !== row.id) return
      return this.act(() => api.request('/storage-locations/' + row.id, { method: 'DELETE', revision: row.revision }), async () => {
        this.update({ mode: 'locations', locationId: null, busy: false }); await this.load({ afterWrite: true })
      })
    },
    async chooseTarget() {
      if (!this.data.chosenCount || this.data.busy) return
      const choices = [{ id: null, name: '未设置位置' }, ...this.data.locations]
      // Native action sheets have limited rows; use an in-page target list instead.
      this.update({ targetOpen: true, targets: choices, targetQuery: '' })
    },
    targetSearch(e) { const q = e.detail.value; this.update({ targetQuery: q, targets: [{ id: null, name: '未设置位置' }, ...this.data.locations].filter(l => l.name.includes(q.trim())) }) },
    closeTarget() { if (!this.data.busy) this.update({ targetOpen: false }) },
    targetTap(e) { const target = Number(e.currentTarget.dataset.id) || null; return this.move(target) },
    addSelected() { return this.move(this.data.locationId) },
    clearSelected() { return this.move(null) },
    async singleMove(id) {
      const item = this.data.items.find(i => i.id === this.assignItemId)
      if (!item) { this.update({ error: '物品已删除或处置，请返回详情核对。' }); return }
      return this.move(id, [{ id: item.id, revision: item.revision }], true)
    },
    async move(target, entries = Object.values(this.data.chosen), single = false) {
      if (!entries.length || !this.data.ready || this.data.busy || this.data.conflict) return
      const { mode, locationId, picking, selecting, targetOpen } = this.data
      const name = target ? this.data.locations.find(l => l.id === target)?.name : '未设置位置'
      if (!name || !await this.confirm('确认设置位置', '将 ' + entries.length + ' 件物品设置为「' + name + '」？')) return
      const data = this.data
      if (data.mode !== mode || data.locationId !== locationId || data.picking !== picking ||
          data.selecting !== selecting || data.targetOpen !== targetOpen) return
      if (single ? this.assignItemId !== entries[0].id :
          data.chosenCount !== entries.length || entries.some(entry => !data.chosen[entry.id] ||
            data.chosen[entry.id].revision !== entry.revision)) return
      return this.act(() => api.request('/storage-locations/assign', { method: 'POST', data: { storage_location_id: target, items: entries } }), async () => {
        if (single) { wx.navigateBack(); return }
        this.update({ choosing: false, targetOpen: false, selecting: false, picking: false, chosen: {}, chosenCount: 0, busy: false })
        await this.load({ afterWrite: true })
      })
    },
    async review() {
      if (!this.current() || this._write || this._confirmation || this.data.busy) return
      const ids = Object.keys(this.data.chosen)
      if (!await this.load() || !this.current() || !this.data.ready) return
      const chosen = Object.fromEntries(this.data.items.filter(i => ids.includes(String(i.id))).map(i => [i.id, { id: i.id, revision: i.revision }]))
      this.update({ chosen, chosenCount: Object.keys(chosen).length, conflict: false, error: '已读取最新资料，请核对所选物品及位置后重新确认。' }); this.apply()
    }
  }
}

module.exports = { createStorageLocationsPage }
