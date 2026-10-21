const api = require('../../../utils/api')
const view = require('../../../utils/view')
function sync(page) {
  const rows = page.data.storageLocations || [], id = page.data.form.storage_location_id || null
  const row = rows.find(r => r.id === id)
  page.setData({ locationNames: ['未设置位置', ...rows.map(r => r.name), '新增位置…'],
    locationIndex: row ? rows.indexOf(row) + 1 : 0,
    locationText: page.data.locationsReady ? (row ? row.name : '未设置位置') : page.data.form.storage_location_name || (id ? '保留原位置' : '未设置位置') })
}
async function load(page) {
  const seq = page._locationSeq = (page._locationSeq || 0) + 1
  const token = page._token
  try {
    const result = await api.request('/storage-locations')
    if (!page.current(token) || seq !== page._locationSeq) return
    if (!result || !Array.isArray(result.locations)) throw new Error('位置数据暂不可用')
    page.setData({ storageLocations: result.locations, locationsReady: true, locationsError: '' }); sync(page)
  } catch (e) {
    if (page.current(token) && seq === page._locationSeq) {
      page.setData({ locationsReady: false, locationsError: e.status === 404 ? '收纳位置尚未同步到云端；原位置保留，其他资料仍可保存。' : '位置读取失败；原位置保留，暂不能更换。' }); sync(page)
    }
  }
}
async function change(page, e) {
  if (!page.current() || !page.data.locationsReady || page.data.busy) return
  const n = Number(e.detail.value), rows = page.data.storageLocations
  let row = n ? rows[n - 1] : null
  if (n === rows.length + 1) {
    const token = page._token
    const result = await new Promise(resolve => wx.showModal({ title: '新增收纳位置', editable: true, placeholderText: '例如：书桌抽屉', success: resolve, fail: () => resolve({ confirm: false }) }))
    if (!result.confirm || !page.current(token)) return
    const name = (result.content || '').trim()
    if (!name || [...name].length > 40) { page.setData({ locationsError: '位置名称请填写1至40字' }); return }
    row = rows.find(r => r.name === name)
    if (!row) {
      page.setData({ busy: true })
      try {
        row = await api.request('/storage-locations', { method: 'POST', data: { name } })
        if (!page.current(token)) return
        page.setData({ storageLocations: [...rows, row] })
      } catch (error) { if (page.current(token)) page.setData({ locationsError: view.errorMessage(error) }); return }
      finally { if (page.current(token)) page.setData({ busy: false }) }
    } else wx.showToast({ title: '已选择已有位置', icon: 'none' })
  } else if (n && !row) return
  page.setData({ 'form.storage_location_id': row ? row.id : null, 'form.storage_location_name': row ? row.name : '', locationsError: '' }); sync(page); page.changed()
}
module.exports = { sync, load, change }
