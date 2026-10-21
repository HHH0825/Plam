const api = require('../../utils/api')
const { today, errorMessage } = require('../../utils/view')
const { readMonthly, presentMonthly, reportPageStyle, REPORT_DESIGN_VERSION } = require('../../utils/monthly')
const { reportImage, shareCoverImage, discardImage } = require('../../utils/report-image')
const { nativeCall } = require('../../utils/photo-edit')
const { navigate, resetNavigation } = require('../../utils/navigation')
const LOGIN_PATH = '/pages/login/index'
async function imageExists(path) {
  if (!path) return false
  return new Promise(resolve => {
    try { wx.getFileSystemManager().access({ path, success: () => resolve(true), fail: () => resolve(false) }) } catch (_) { resolve(false) }
  })
}
Page(require('../../utils/member').wrap({
  data: { month: '', maxMonth: '', report: null, edition: null, reportStyle: reportPageStyle(), coversLoading:false, loading: true, error: '', imageError: '', imagePath: '', coverPath: '', imageBusy: false, shareFallback: false },
  onLoad(options = {}) { this._sequence = 0; this.resize(); this._requested = /^\d{4}-\d{2}$/.test(options.month || '') ? options.month : '' },
  resize(width) {
    try { width = width || (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).windowWidth } catch (_) {}
    this.setData({ reportStyle: reportPageStyle(width) })
  },
  onMemberAppearanceChange() {
    discardImage(this.data.imagePath);discardImage(this.data.coverPath);discardImage(this.data.memberReportPath);this._imageKey=JSON.stringify([this.data.report,require('../../utils/member').effective()]);this.setData({imagePath:'',coverPath:'',memberReportPath:''});if(this.data.report&&!this.data.coversLoading)this.memberReportPreview()
  },
  async memberReportPreview(){
    const appearance=require('../../utils/member').effective(),sequence=this._sequence,token=this._token,previewEpoch=this._memberPreviewEpoch=(this._memberPreviewEpoch||0)+1;const current=()=>this.current(sequence,token)&&previewEpoch===this._memberPreviewEpoch;if(!this.data.report||!appearance||appearance.template==='default'&&appearance.theme==='default'&&!appearance.sticker){this.setData({memberReportPath:'',memberReportPreview:false});return}
    this.setData({memberReportPreview:true});try{const path=await reportImage(this,this.data.report,current,this._coverPaths||{});if(current()){discardImage(this.data.memberReportPath);this.setData({memberReportPath:path})}else discardImage(path)}catch(_){if(current())this.setData({memberReportPreview:false})}
  },
  onResize(e) { this.resize(e.size && e.size.windowWidth) },
  onShow() {
    this._nativeExpectedUntil = 0
    this._visible = true; resetNavigation(this)
    if (!getApp().requireSession()) { this.invalidate(); return }
    if (this._resumeNative && this._token === getApp().globalData.token && this.data.report) {
      this._resumeNative = false
      if (this._cardShare) { this._cardShare = false; this._nativeActive = false }
      return
    }
    this._cardShare = false; this._nativeActive = false
    this._resumeNative = false; this.load()
  },
  onHide() {
    this._visible = false
    // Some native APIs acknowledge opening before the page receives onHide.
    if ((this._nativeActive || Date.now() < (this._nativeExpectedUntil || 0)) && this._token === getApp().globalData.token) {
      this._nativeExpectedUntil = 0; this._resumeNative = true; return
    }
    this.invalidate()
  },
  onUnload() { this._visible = false; this.invalidate() },
  invalidate(keepIcons = false) {
    if (this._coverPhotos) this._coverPhotos.release(this._coverOwner)
    this._coverPaths = {}; this._coverErrors = {}
    this._sequence++; this._resumeNative = false; this._imageKey = ''; this._nativeExpectedUntil = 0
    discardImage(this.data.imagePath); discardImage(this.data.coverPath);discardImage(this.data.memberReportPath);this.setData({memberReportPath:'',memberReportPreview:false})
    this.setData({ report: null, edition: null, coversLoading:false, imagePath: '', coverPath: '', imageError: '', imageBusy: false, shareFallback: false })
  },
  current(sequence, token) { return (this._visible || this._nativeActive) && sequence === this._sequence && token === this._token && token === getApp().globalData.token },
  async load(reuseIcons = false) {
    this.invalidate()
    const sequence = this._sequence, token = getApp().globalData.token; this._token = token
    this.setData({ loading: true, error: '' })
    try {
      const report = readMonthly(await api.request('/reports/monthly' + (this._requested ? '?month=' + this._requested : '')))
      if (!this.current(sequence, token)) return
      this._requested = report.month
      // The scope stays in memory; no session or report is written to local storage.
      this._imageKey = JSON.stringify([REPORT_DESIGN_VERSION, report])
      this.setData({ month: report.month, maxMonth: report.today.slice(0, 7), report, edition: presentMonthly(report), loading: false })
      this.setData({coversLoading:true})
      try {await this.readCovers(report, sequence, token)} finally {if(this.current(sequence,token)){this.setData({coversLoading:false});await this.memberReportPreview()}}
    } catch (error) { if (this.current(sequence, token)) this.setData({ loading: false, error: errorMessage(error), maxMonth: this.data.maxMonth || today().slice(0, 7) }) }
  },
  async readCovers(report, sequence, token) {
    if (!api.photoCache) return
    this._coverPhotos = api.photoCache(); this._coverOwner = this._coverOwner || {}; this._coverPhotos.sync(report.purchases)
    await Promise.all(report.purchases.filter(i=>require('../../utils/item-covers').photo(i)).map(async item=>{
      try {const path=await this._coverPhotos.load(item,this._coverOwner,'thumb');if(this.current(sequence,token)&&path)this._coverPaths[item.id]=path}catch(_){/* Keep the local illustration. */}
    }))
    if(this.current(sequence,token))this.setData({edition:presentMonthly(report,this._coverPaths)})
  },
  coverFailed(e) {
    const id=Number(e.currentTarget.dataset.id),item=this.data.report?.purchases.find(i=>i.id===id)
    if(!item)return
    if(this._coverErrors[id])return
    this._coverErrors[id]=true
    this._coverPaths[id]=require('../../utils/item-covers').fallback(item)
    this.setData({edition:presentMonthly(this.data.report,this._coverPaths)})
  },
  changeMonth(e) { this._requested = e.detail.value; this.setData({ month: e.detail.value }); return this.load(true) },
  open(e) { this._nativeExpectedUntil = 0; navigate(this, '/pages/item/index?id=' + e.currentTarget.dataset.id) },
  add() { this._nativeExpectedUntil = 0; navigate(this, '/pages/editor/index') },
  preview() { return this.exportImage('preview') },
  saveImage() { return this.exportImage('save') },
  shareImage() { return this.exportImage('share') },
  async fallback(current) {
    let cover = this.data.coverPath
    if (!await imageExists(cover)) { discardImage(cover); cover = '' }
    if (!current()) return
    cover = cover || await shareCoverImage(this, this.data.report, current)
    if (!current()) { discardImage(cover); return }
    this.setData({ coverPath: cover, shareFallback: true, imageError: '可再次点击下方按钮，改用小程序卡片分享。' })
  },
  onShareAppMessage(options={}) {
    if(options.from!=='button')return require('../../utils/share').introduction()
    const scoped = this._token === getApp().globalData.token && !!this.data.report && !!this.data.coverPath
    this._nativeActive = true; this._cardShare = true
    // Never use the implicit page screenshot: it could show an obsolete account.
    return { title: scoped ? this.data.month + ' · 每月一页收藏小报' : '猫爪物帐 · 记录物品的陪伴', path: LOGIN_PATH,
      imageUrl: scoped ? this.data.coverPath : '/assets/white-doodle/share-fallback.png' }
  },
  async exportImage(action) {
    if (this._token !== getApp().globalData.token) { this.invalidate(); return }
    if (!this.data.report || this.data.loading || this.data.coversLoading || this.data.imageBusy || !getApp().requireSession()) return
    await this.memberRefresh(true);if(!this._visible||this._token!==getApp().globalData.token||!this.data.report)return
    const sequence = this._sequence, token = getApp().globalData.token, key = this._imageKey
    const current = () => this.current(sequence, token) && key === this._imageKey
    this.setData({ imageBusy: true, imageError: '' })
    try {
      let path = this.data.imagePath
      if (path) {
        const exists = await imageExists(path)
        if (!current()) return
        if (!exists) { discardImage(path); path = ''; this.setData({ imagePath: '' }) }
      }
      path = path || await reportImage(this, this.data.report, current, this._coverPaths || {})
      if (!current()) { discardImage(path); return }
      this.setData({ imagePath: path })
      if (action === 'share' && (typeof wx.showShareImageMenu !== 'function' || wx.canIUse && !wx.canIUse('showShareImageMenu'))) {
        await this.fallback(current); return
      }
      this._nativeActive = true
      this._nativeExpectedUntil = action === 'preview' || action === 'share' ? Date.now() + 1500 : 0
      if (action === 'preview') await nativeCall('previewImage', { current: path, urls: [path] })
      else if (action === 'share') await nativeCall('showShareImageMenu', { path, needShowEntrance: true, entrancePath: LOGIN_PATH })
      else { await nativeCall('saveImageToPhotosAlbum', { filePath: path }); if (current()) wx.showToast({ title: '已保存到相册', icon: 'success' }) }
    } catch (error) {
      if (!current()) return
      this._nativeExpectedUntil = 0
      const cancelled = /cancel/i.test(error.errMsg || error.message || '')
      if (cancelled) return
      if (action === 'share') {
        try { await this.fallback(current) } catch (_) { if (current()) this.setData({ imageError: '分享封面生成失败，请重试。' }) }
      } else this.setData({ imageError: /auth|deny|denied|permission|privacy/i.test(error.errMsg || '') ?
        '没有相册保存权限。可先预览图片，或在微信设置中允许后重试。' : '图片生成或保存失败，请重试。' })
    } finally {
      if (current()) this.setData({ imageBusy: false })
      this._nativeActive = false
    }
  }
}))
