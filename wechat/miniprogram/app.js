const config = require('./config')
const cloud = ['cloud_function', 'cloud_http_function'].includes(config.API_TRANSPORT)
const sessionKey = config.API_TRANSPORT === 'cloud_http_function'
  ? `palmSession:cloud_http_function:${config.CLOUDBASE_ENV_ID}:palm-api`
  : cloud ? `palmSession:cloud:${config.CLOUDBASE_ENV_ID}:${config.CLOUD_FUNCTION}` : `palmSession:local:${config.API_BASE}`

// 正常本地会话使用 palmSession；临时界面测试须在独立项目中进行。
App({
  globalData: { token: '', expiresAt: 0, user: null },
  onLaunch(options = {}) {
    this._foreground=true
    wx.onKeyboardHeightChange?.(event=>{this._keyboardHeight=event.height||0})
    if (cloud) {
      if (!wx.cloud || !(config.API_TRANSPORT === 'cloud_http_function' ? wx.cloud.callHTTPFunction : wx.cloud.callFunction)) throw new Error('请升级微信以使用云端服务')
      wx.cloud.init({ env: config.CLOUDBASE_ENV_ID, traceUser: false })
    }
    const saved = wx.getStorageSync(sessionKey)
    if (saved && saved.expiresAt * 1000 > Date.now()) {
      this.globalData = { token: saved.token, expiresAt: saved.expiresAt, user: saved.user }
    } else {
      wx.removeStorageSync(sessionKey)
    }
    this.captureInvitation(options)
  },
  onShow(options = {}) {this._foreground=true;this.captureInvitation(options);if(this.hasSession()){require('./utils/rewards').foreground();this.scheduleVisit()}},
  onHide() {this._foreground=false;this._keyboardHeight=0;clearTimeout(this._visitTimer)},
  scheduleVisit() {
    clearTimeout(this._visitTimer)
    const token=this.globalData.token
    const probe=()=>{
      if(!this._foreground||token!==this.globalData.token||!this.hasSession())return
      if(require('./utils/loading-activity').snapshot().some(r=>r.token===token)||this._sessionNavigation){this._visitTimer=setTimeout(probe,500);return}
      require('./utils/rewards').visitForForeground().catch(()=>{})
    }
    this._visitTimer=setTimeout(probe,800)
  },
  captureInvitation(options) {
    if(this.hasSession()){this._invitation='';return}
    const code=options.query?.invite
    if(typeof code==='string'&&/^[a-f0-9]{40}$/.test(code)&&!this.hasSession())this._invitation=code
  },
  hasSession() {
    return !!this.globalData.token && this.globalData.expiresAt * 1000 > Date.now()
  },
  requireSession() {
    if (this.hasSession()) return true
    if(this.globalData.token||this.globalData.user)this.clearSession()
    require('./utils/session-navigation').go(this,'login')
    return false
  },
  login() {
    if(this._loginAttempt)return this._loginAttempt.promise
    const attempt={token:this.globalData.token};this._loginAttempt=attempt
    const task=this.performLogin(attempt).finally(()=>{if(this._loginAttempt===attempt)this._loginAttempt=null})
    attempt.promise=task;return task
  },
  async performLogin(attempt) {
    let code = `dev:${config.DEV_ACCOUNT}`
    if (cloud || !config.DEV_LOGIN) {
      const result = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
      code = result.code
    }
    const api = require('./utils/api')
    const session = await api.request('/auth/login', { method: 'POST', data: { code, ...(this._invitation ? {invite_code:this._invitation} : {}) }, anonymous: true })
    if(this._loginAttempt!==attempt||this.globalData.token!==attempt.token)throw Error('登录账户已切换，请重新登录')
    this._invitation=''
    require('./utils/rewards').reset()
    api.clearPhotos()
    this.globalData = { token: session.token, expiresAt: session.expires_at, user: session.user }
    wx.setStorageSync(sessionKey, this.globalData)
    this.scheduleVisit()
    return session.user
  },
  clearSession() {
    clearTimeout(this._visitTimer);this._loginAttempt=null;this._nextSessionNavigation=null
    require('./utils/member').reset()
    require('./utils/rewards').reset()
    this.globalData = { token: '', expiresAt: 0, user: null }
    require('./utils/api').clearPhotos()
    wx.removeStorageSync(sessionKey)
  },
  updateUser(user, token) {
    if (!this.hasSession() || this.globalData.token !== token) return false
    this.globalData = { ...this.globalData, user }
    wx.setStorageSync(sessionKey, this.globalData)
    return true
  }
})
