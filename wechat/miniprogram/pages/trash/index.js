const api = require('../../utils/api')
const view = require('../../utils/view')
Page(require('../../utils/member').wrap({
  data: { items: [], loading: true, error: '' },
  onShow() { this.setData({localMode:!!getApp().globalData.localMode});if (getApp().requireSession()) this.load() },
  async load() {
    const token = getApp().globalData.token
    this._token = token
    this.setData({items:[]})
    this.setData({ loading: true, error: '' })
    try {
      const items = await api.request('/trash')
      if (token !== getApp().globalData.token) return
      this.setData({ items: items.map(item => ({ ...view.decorate(item),
        deletedDay: item.deleted_at.slice(0, 10), expiresDay: item.expires_at?.slice(0, 10)||'' })) })
    } catch (error) { if (token === getApp().globalData.token) this.setData({ error: view.errorMessage(error) }) }
    finally { this.setData({ loading: false }) }
  },
  coverFailed(e) { const id=Number(e.currentTarget.dataset.id);this.setData({items:this.data.items.map(i=>i.id===id?{...i,art:i.art===i.fallbackArt?'':i.fallbackArt}:i)}) },
  async restore(event) {
    if (this._token !== getApp().globalData.token) return this.load()
    const item = this.data.items.find(row => row.id === Number(event.currentTarget.dataset.id))
    if (!item) return
    try { await api.request(`/trash/${item.id}/restore`, { method: 'POST', revision: item.revision }); wx.showToast({ title: '已恢复' }); this.load() }
    catch (error) { wx.showToast({ title: view.errorMessage(error), icon: 'none' }); this.load() }
  },
  async remove(event) {
    if (this._token !== getApp().globalData.token) return this.load()
    const id = event.currentTarget.dataset.id
    const item = this.data.items.find(row => row.id === Number(id))
    if (!item) return
    const confirm = await new Promise(resolve => wx.showModal({ title: '永久删除？',
      content: '此物品及照片、历史使用、维修和处置记录将永久删除，无法恢复。订阅/分期和付款历史保留，物品关联将移除。', success: result => resolve(result.confirm) }))
    if (!confirm) return
    if (this._token !== getApp().globalData.token) return this.load()
    try { await api.request(`/trash/${id}`, { method: 'DELETE', revision: item.revision }); wx.showToast({ title: '已永久删除' }); this.load() }
    catch (error) { wx.showToast({ title: view.errorMessage(error), icon: 'none' }) }
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) }
}))
