const api = require('../../utils/api')
const view = require('../../utils/view')
const { navigate } = require('../../utils/navigation')
const { base } = require('../../utils/purchase-ui')
const blank = () => ({ name: '', expected_price: '', reason: '', category: '', review_on: '', status: 'considering' })
const label = { considering: '考虑中', declined: '暂不买', purchased: '已购入' }
Page(require('../../utils/member').wrap({
  ...base(), kind: 'wish',
  data: { rows: [], shown: [], filter: 'considering', filters: ['考虑中','暂不买','已购入','全部'], filterIndex: 0, selected: null, editing: false, form: blank(), similar: [], photoPaths: {}, busy: false, loading: true, error: '', conflict: false },
  async load() {
    if (!this.current()) return
    const sequence = ++this._sequence
    this.setData({ loading: true })
    try {
      const rows = await api.request('/wishlist')
      if (!this.current(sequence)) return
      this.setData({ rows: rows.map(r => ({ ...r, stateText: label[r.status], reviewText: r.review_days == null ? '加入于 ' + r.created_on : r.review_days > 0 ? `还有 ${r.review_days} 天考虑` : r.review_days === 0 ? '今天再想想' : '已到考虑日期' })), loading: false, error: '' })
      this.apply()
    } catch (e) { if (this.current(sequence)) this.setData({ loading: false, error: view.errorMessage(e) }) }
  },
  apply() { this.setData({ shown: this.data.rows.filter(r => !this.data.filter || r.status === this.data.filter) }) },
  filter(e) { const n = Number(e.detail.value); this.setData({ filterIndex: n, filter: ['considering','declined','purchased',''][n] }); this.apply() },
  add() { this.setData({ selected: null, editing: true, form: this.restoreForm(blank()), similar: [], error: '' }) },
  async open(e) {
    const id = Number(e.currentTarget.dataset.id)
    return this.act(() => api.request('/wishlist/' + id), async row => {
      this.setData({ selected: row, editing: true, form: this.restoreForm({ name: row.name, expected_price: row.expected_price, reason: row.reason, category: row.category, review_on: row.review_on || '', status: row.status }, id) })
      await this.readSimilar(row.similar_items || [])
    })
  },
  clearDate() { this.setData({ 'form.review_on': '' }); this.storeForm() },
  save() {
    const row = this.data.selected, id = row?.id
    return this.act(() => api.request('/wishlist' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', data: this.data.form, revision: row?.revision }), async saved => {
      this.clearForm(id || 'new'); this.setData({ selected: saved, conflict: false }); wx.showToast({ title: '心愿已保存' }); await this.readSimilar(saved.similar_items || [])
    })
  },
  async state() {
    if (!this.data.selected || this.data.selected.status === 'purchased') return
    this.setData({ 'form.status': this.data.form.status === 'declined' ? 'considering' : 'declined' }); return this.save()
  },
  async remove() {
    const row = this.data.selected
    if (!row || !await this.confirm('删除这个心愿？', '已经转换出的物品不会被删除。')) return
    return this.act(() => api.request('/wishlist/' + row.id, { method: 'DELETE', revision: row.revision }), () => { this.clearForm(row.id); this.back() })
  },
  async convert() {
    const row = this.data.selected
    if (!row || this.data.busy) return
    if (row.status === 'purchased') { if (row.item_available) navigate(this, '/pages/item/index?id=' + row.item_id); return }
    return this.act(() => api.request('/wishlist/' + row.id), async latest => {
      this.setData({ selected: latest }); await this.readSimilar(latest.similar_items || [])
      const content = latest.similar_items?.length ? '你已有：' + latest.similar_items.map(i => i.name + '（' + i.match_reason + '）').join('、') + '。仍可继续购买。' : '将打开物品表单，请核对实际购买日期和价格。'
      if (await this.confirm('转为物品档案', content)) navigate(this, '/pages/editor/index?wishId=' + row.id)
    })
  },
  reviewConflict() {
    const row = this.data.selected
    if (!row) return
    return this.act(() => api.request('/wishlist/' + row.id), async latest => {
      if (await this.confirm('核对云端心愿', `${latest.name} · ${label[latest.status]}\n预计价格 ${latest.expected_price || '未填'}；理由：${latest.reason || '未填'}\n当前填写保留，核对后再保存。`)) {
        this.setData({ selected: latest, 'form.status': latest.status, conflict: false, error: '已核对最新版本，请再次保存。' })
      }
    })
  }
}))
