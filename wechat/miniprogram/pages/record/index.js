const api = require('../../utils/api')
const view = require('../../utils/view')
Page(require('../../utils/member').wrap({
  data: { kind: 'maintenance', retired: false, recordId: 0, today: view.today(), form: { maintained_on: view.today(),
    disposed_on: view.today(), cost: '', description: '', proceeds: '', method: 'sold', notes: '' },
    methods: ['出售', '赠送', '丢弃', '其他'], methodIndex: 0, busy: false, loading: false, loadFailed: false, versionConflict: false, focusField: '', error: '' },
  onLoad(options) {
    if (!getApp().requireSession()) return
    this._token = getApp().globalData.token
    this.itemId = Number(options.itemId)
    this.recordId = Number(options.id || 0)
    this.kind = options.kind
    if (this.kind === 'usage') {
      this.setData({ retired: true })
      wx.showModal({ title: '使用记录已停用', content: '历史内容可在物品详情底部查看，不再新增或修改使用记录。', showCancel: false, success: () => this.back() })
      return
    }
    if (!['maintenance', 'disposal'].includes(this.kind) || !this.itemId) { this.back(); return }
    this.setData({ kind: this.kind, recordId: this.recordId })
    this.load()
  },
  onShow() {
    if (this._token !== getApp().globalData.token) {
      this._serverRevision = undefined
      this.setData({form:{},loadFailed:true,error:'登录账户已切换，请重新打开记录。'})
    }
  },
  async load() {
    if (this.data.retired) return
    const token = this._token
    this.setData({ loading: true, loadFailed: false, error: '' })
    try {
      const item = await api.request(`/items/${this.itemId}`)
      if (token !== getApp().globalData.token) return
      this._serverRevision = item.revision
      if (!this.recordId) return
      const records = this.kind === 'disposal' ? [item.disposal] : item[`${this.kind}_records`]
      const record = records.find(entry => entry && entry.id === this.recordId)
      if (!record) throw new Error('记录已不存在')
      this.setData({ form: { ...this.data.form, ...record }, methodIndex: ['sold', 'gifted', 'discarded', 'other'].indexOf(record.method) < 0 ? 0 : ['sold', 'gifted', 'discarded', 'other'].indexOf(record.method) })
    } catch (error) { if (token === getApp().globalData.token) this.setData({ loadFailed: true, error: view.errorMessage(error) }) }
    finally { this.setData({ loading: false }) }
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }) },
  focus(event) { this.setData({ focusField: event.currentTarget.dataset.key }) },
  blur() { this.setData({ focusField: '' }) },
  back() { wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/items/index' }) }) },
  methodChange(event) {
    const index = Number(event.detail.value)
    this.setData({ methodIndex: index, 'form.method': ['sold', 'gifted', 'discarded', 'other'][index] })
  },
  async save() {
    if (this._token !== getApp().globalData.token) {this.onShow(); return}
    if (this.data.busy || this.data.loading || this.data.loadFailed || this.data.versionConflict || !['maintenance', 'disposal'].includes(this.kind)) return
    this.setData({ busy: true, error: '' })
    const base = `/items/${this.itemId}/${this.kind}`
    const path = this.recordId ? `/${this.kind}/${this.recordId}` : base
    const form = this.data.form
    const payload = this.kind === 'maintenance' ? { maintained_on: form.maintained_on, cost: form.cost, description: form.description }
        : { disposed_on: form.disposed_on, method: form.method, proceeds: form.proceeds, notes: form.notes }
    try { await api.request(path, { method: this.recordId ? 'PUT' : 'POST', data: payload, revision: this._serverRevision });
      if (this._token !== getApp().globalData.token) return
      if (this.kind === 'disposal') wx.showToast({ title: '已归入处置档案', icon: 'none' })
      wx.navigateBack() }
    catch (error) { this.setData({ error: view.errorMessage(error), versionConflict: error.code === 'ITEM_VERSION_CONFLICT' }) }
    finally { this.setData({ busy: false }) }
  },
  async remove() {
    if (this._token !== getApp().globalData.token) {this.onShow(); return}
    if (this.data.busy || this.data.loading || this.data.loadFailed || this.data.versionConflict || !['maintenance', 'disposal'].includes(this.kind) || !this.recordId) return
    const confirm = await new Promise(resolve => wx.showModal({ title: '删除这条记录？', content: '删除后统计会重新计算。', success: result => resolve(result.confirm) }))
    if (!confirm) return
    if (this._token !== getApp().globalData.token) {this.onShow(); return}
    try { await api.request(`/${this.kind}/${this.recordId}`, { method: 'DELETE', revision: this._serverRevision });
      if (this._token !== getApp().globalData.token) return
      wx.navigateBack() }
    catch (error) { this.setData({ error: view.errorMessage(error), versionConflict: error.code === 'ITEM_VERSION_CONFLICT' }) }
  },
  async reviewConflict() {
    if (this.data.busy || this._token !== getApp().globalData.token) return
    const token = this._token
    try {
      const latest = await api.request(`/items/${this.itemId}`)
      if (token !== getApp().globalData.token) return
      const records = this.kind === 'disposal' ? [latest.disposal] : latest.maintenance_records
      const record = this.recordId ? records?.find(row => row && row.id === this.recordId) : null
      if (this.recordId && !record) throw new Error('这条记录已在其他设备删除，填写内容仍保留，请返回物品核对。')
      const fields = this.kind === 'maintenance' ? ['maintained_on','cost','description'] : ['disposed_on','method','proceeds','notes']
      const labels = {maintained_on:'维修日期',cost:'维修费用',description:'说明',disposed_on:'处置日期',method:'处置方式',proceeds:'回收金额',notes:'备注'}
      const content = record ? fields.map(key => `${labels[key]}：云端 ${record[key] ?? '空'}；当前填写 ${this.data.form[key] || '空'}`).join('\n')
        : '物品或关联记录已在其他设备更新。当前填写内容保留，请核对物品详情后再保存新记录。'
      const agreed = await new Promise(resolve => wx.showModal({title:'核对其他设备的修改',content,confirmText:'已核对',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
      if (agreed && token === getApp().globalData.token) {
        this._serverRevision = latest.revision
        this.setData({versionConflict:false,error:'最新版本已读取，填写内容保留，请核对后再保存。'})
      }
    } catch (error) {if(token === getApp().globalData.token) this.setData({error:view.errorMessage(error)})}
  }
}))
