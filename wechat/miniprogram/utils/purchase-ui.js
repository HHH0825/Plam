const api = require('./api')
const view = require('./view')
const { navigate, resetNavigation } = require('./navigation')
const key = (kind, id = '') => `palmForm:${require('./cloud-transport').serviceScope()}:${getApp().globalData.user?.id}:${kind}:${id}`
function base() {
  return {
    onLoad(options = {}) { this.options = options; this._sequence = 0; this._token = getApp().globalData.token; this._photos = api.photoCache(); this._photoOwner = {} },
    onShow() {
      this._visible = true; resetNavigation(this)
      if (getApp().globalData.token !== this._token) {
        this._sequence++; this._photos.release(this._photoOwner)
        this.setData({ rows: [], shown: [], items: [], itemNames: [], selected: null, form: {}, payment: {}, similar: [], photoPaths: {}, totals: null, editing: false, paying: false, error: '账户已切换，请重新打开页面。', busy: false, loading: false, listReady: false, itemsReady: false, itemsLoading: false, itemsError: '', detailMissing: false, conflict: false })
        this._locked = true; return
      }
      if (getApp().requireSession()) this.load()
    },
    onHide() { this._visible = false; this._sequence++; this._photos.release(this._photoOwner); this.setData({ busy: false }) },
    onUnload() { this._visible = false; this._sequence++; this._photos.release(this._photoOwner) },
    current(sequence = this._sequence) { return !this._locked && this._visible && sequence === this._sequence && this._token === getApp().globalData.token },
    field(e) { if (!this.current() || this.data.busy) return; this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }); this.storeForm() },
    dateField(e) { this.field(e) },
    storeForm() {
      if (!this.current()) return
      try { wx.setStorageSync(key(this.kind, this.data.selected?.id || 'new'), this.data.form) }
      catch (_) { this.setData({ error: '本机草稿未保存，填写内容仍在当前页面。' }) }
    },
    restoreForm(form, id = 'new') {
      try { const saved = wx.getStorageSync(key(this.kind, id)); return saved && typeof saved === 'object' ? { ...form, ...saved } : form }
      catch (_) { return form }
    },
    clearForm(id = 'new') { try { wx.removeStorageSync(key(this.kind, id)) } catch (_) {} },
    back() { this.setData({ editing: false, paying: false, selected: null, error: '', conflict: false, detailMissing: false, similar: [] }); return this.load() },
    openItem(e) { if (this.current()) navigate(this, '/pages/item/index?id=' + e.currentTarget.dataset.id) },
    async confirm(title, content) {
      const sequence = this._sequence
      const result = await new Promise(resolve => wx.showModal({ title, content, success: r => resolve(r.confirm), fail: () => resolve(false) }))
      return result && this.current(sequence)
    },
    async act(action, success) {
      if (!this.current() || this.data.busy) return
      const sequence = this._sequence
      this.setData({ busy: true, error: '', conflict: false })
      try { const result = await action(); if (this.current(sequence)) await success(result) }
      catch (e) { if (this.current(sequence)) this.setData({ error: view.errorMessage(e), conflict: e.status === 409 || e.status === 428, ...(this.actionError ? this.actionError(e) : {}) }) }
      finally { if (this.current(sequence)) this.setData({ busy: false }) }
    },
    async readSimilar(items) {
      const sequence = this._sequence
      this._photos.release(this._photoOwner)
      this.setData({ similar: items.map(view.decorate), photoPaths: {}, similarCoverErrors:{} })
      for (const item of this.data.similar.filter(i => i.photo_url)) {
        try { const path = await this._photos.load(item, this._photoOwner, 'thumb'); if (this.current(sequence)) this.setData({ [`photoPaths.${item.id}`]: path }) }
        catch (_) { /* Category artwork remains visible. */ }
      }
    }
    ,similarCoverFailed(e) {const id=Number(e.currentTarget.dataset.id);if(this.data.photoPaths[id])this.setData({['photoPaths.'+id]:''});else this.setData({similar:this.data.similar.map(i=>i.id===id?{...i,art:i.art===i.fallbackArt?'':i.fallbackArt}:i)})}
  }
}
module.exports = { base, formKey:key }
