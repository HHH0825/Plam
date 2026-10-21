const { errorMessage } = require('../../utils/view')
const { welcomeLayout, readWindowInfo } = require('./lib/layout')
const config = require('../../config')
Page(require('../../utils/share').wrap({
  data: { memberThemeClass:'',memberThemeStyle:'',busy: false, error: '', logoFailed: false, titleFailed: false, heroFailed: false, cameraFailed: false, foodFailed: false, featureFailed: false, decorFailed: false, devLogin: config.DEV_LOGIN, ...welcomeLayout() },
  onLoad() { this.updateLayout(); if (getApp().hasSession())require('../../utils/session-navigation').go(getApp(),'home') },
  onShow(){this._disposed=false},
  onUnload(){this._disposed=true},
  onResize(event) { this.updateLayout(event.size) },
  updateLayout(size) { this.setData(welcomeLayout(size || readWindowInfo())) },
  logoError() { this.setData({ logoFailed: true }) },
  assetError(event) {
    const asset = event.currentTarget.dataset.asset
    if (['title', 'hero', 'camera', 'food', 'feature', 'decor'].includes(asset)) this.setData({ [asset + 'Failed']: true })
  },
  async login() {
    if (this.data.busy) return
    this.setData({ busy: true, error: '' })
    try { await getApp().login();if(!this._disposed)require('../../utils/session-navigation').go(getApp(),'home') }
    catch (error) { if(!this._disposed)this.setData({ error: errorMessage(error) }) }
    finally { if(!this._disposed)this.setData({ busy: false }) }
  }
}))
