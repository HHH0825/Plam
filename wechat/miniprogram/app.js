const config = require('./config')
const cloud = ['cloud_function', 'cloud_http_function'].includes(config.API_TRANSPORT)
const sessionKey = config.API_TRANSPORT === 'cloud_http_function'
  ? `palmSession:cloud_http_function:${config.CLOUDBASE_ENV_ID}:palm-api`
  : cloud ? `palmSession:cloud:${config.CLOUDBASE_ENV_ID}:${config.CLOUD_FUNCTION}` : `palmSession:local:${config.API_BASE}`

// 正常本地会话使用 palmSession；临时界面测试须在独立项目中进行。
App({
  // token is the stable UI-owner key; accessToken is the current server credential.
  globalData: { token: '', accessToken:'', expiresAt: 0, user: null },
  onLaunch(options = {}) {
    this._foreground=true
    wx.onKeyboardHeightChange?.(event=>{this._keyboardHeight=event.height||0})
    if (cloud) {
      if (!wx.cloud || !(config.API_TRANSPORT === 'cloud_http_function' ? wx.cloud.callHTTPFunction : wx.cloud.callFunction)) throw new Error('请升级微信以使用云端服务')
      wx.cloud.init({ env: config.CLOUDBASE_ENV_ID, traceUser: false })
    }
    const saved = wx.getStorageSync(sessionKey)
    if (saved && typeof saved.token==='string' && saved.token && saved.user?.id) {
      this.globalData = { token: saved.token, accessToken:saved.accessToken||saved.token, expiresAt: saved.expiresAt, user: saved.user }
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
    this.ensureSession().catch(()=>{})
    return false
  },
  subscribeSession(listener){(this._sessionListeners||(this._sessionListeners=new Set())).add(listener);return ()=>this._sessionListeners.delete(listener)},
  notifySession(event){for(const fn of this._sessionListeners||[])try{fn(event)}catch(_){/* A disposed page cannot block credential recovery. */}},
  failSession(error){this.globalData.expiresAt=0;this._sessionPhase='error';this._sessionError=error.message||'连接失败，点击重试';this.notifySession('error')},
  ensureSession(options={}) {
    if(this._loginAttempt)return this._loginAttempt.promise
    if(this._sessionPhase==='connecting'&&this._reconnect)return this._reconnect
    if(!options.force&&this.hasSession())return Promise.resolve(this.globalData.user)
    if(this._sessionPhase==='error'&&!options.retry)return Promise.reject(Error(this._sessionError))
    const attempt={token:this.globalData.token,userId:this.globalData.user?.id};this._loginAttempt=attempt
    this._sessionPhase='connecting';this._sessionError='';this.notifySession('connecting')
    const task=this.performLogin(attempt).catch(error=>{if(this._loginAttempt===attempt)this.failSession(error);throw error}).finally(()=>{if(this._loginAttempt===attempt)this._loginAttempt=null})
    attempt.promise=task;return task
  },
  login(){return this.ensureSession({force:true,retry:true})},
  recoverSession(owner,credential){
    if(owner!==this.globalData.token)return Promise.reject(Error('账户已切换，请重新打开页面'))
    if(credential!==(this.globalData.accessToken||this.globalData.token)&&this.hasSession())return Promise.resolve(this.globalData.user)
    return this.ensureSession({force:true})
  },
  reconnect(){
    if(this._reconnect)return this._reconnect
    const owner=this.globalData.token
    this._reconnect=(async()=>{this._sessionPhase='connecting';this.notifySession('connecting');try{await require('./utils/api').request('/auth/logout',{method:'POST'})}catch(_){}
      if(owner!==this.globalData.token)throw Error('账户已切换')
      this.clearSession();this._reconnectHome=true;return this.ensureSession({retry:true})
    })().finally(()=>{this._reconnect=null});return this._reconnect
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
    if(!session?.token||!session.user?.id||!Number.isFinite(session.expires_at)||session.expires_at*1000<=Date.now())throw Error('连接资料不完整，请重试')
    const same=attempt.userId!==undefined&&attempt.userId===session.user.id
    if(attempt.userId!==undefined&&!same)this.notifySession('changed')
    this._invitation=''
    if(!same){require('./utils/rewards').reset();require('./utils/member').reset();api.clearPhotos()}
    else require('./utils/display-cache').refresh()
    this.globalData = { token: same?attempt.token:session.token, accessToken:session.token, expiresAt: session.expires_at, user: session.user }
    this.saveSession()
    this._sessionPhase='ready';this._sessionError=''
    if(this._reconnectHome||attempt.userId!==undefined&&!same){this._reconnectHome=false;this._sessionGeneration=(this._sessionGeneration||0)+1;require('./utils/session-navigation').go(this,'reset');return session.user}
    this.notifySession('ready')
    this.scheduleVisit()
    return session.user
  },
  clearSession() {
    clearTimeout(this._visitTimer);this._loginAttempt=null;this._nextSessionNavigation=null
    require('./utils/member').reset()
    require('./utils/rewards').reset()
    this.globalData = { token: '', accessToken:'', expiresAt: 0, user: null }
    this._sessionPhase='idle';this._sessionError=''
    require('./utils/api').clearPhotos()
    wx.removeStorageSync(sessionKey)
  },
  saveSession(){wx.setStorageSync(sessionKey,{...this.globalData,token:this.globalData.accessToken||this.globalData.token})},
  updateUser(user, token) {
    if (!this.hasSession() || this.globalData.token !== token) return false
    this.globalData = { ...this.globalData, user }
    this.saveSession()
    return true
  }
})
