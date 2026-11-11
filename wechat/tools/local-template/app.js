// Final local build: startup never reads a cloud session or initializes an SDK.
App({
 globalData:{token:'local-device',localMode:true,expiresAt:Number.MAX_SAFE_INTEGER,user:null},
 onLaunch(){this._foreground=true;wx.onKeyboardHeightChange?.(e=>{this._keyboardHeight=e.height||0});this.prepareLocal()},
 onShow(){this._foreground=true;if(this._sessionPhase==='ready')this.scheduleVisit()},
 onHide(){this._foreground=false;this._keyboardHeight=0;clearTimeout(this._visitTimer)},
 subscribeSession(fn){(this._sessionListeners||(this._sessionListeners=new Set())).add(fn);return()=>this._sessionListeners.delete(fn)},
 notifySession(event){for(const fn of this._sessionListeners||[])try{fn(event)}catch(_){}},
 prepareLocal(){
  this._sessionPhase='connecting';this._sessionError='';this.notifySession('connecting')
  this._localRuntime=require('./local-core/runtime')
  this._localReady=this._localRuntime.open().then(r=>r.business.request('/auth/me')).then(r=>{this.globalData.user=r.user;this._sessionPhase='ready';this._localError=null;this.notifySession('ready');return r.user}).catch(e=>{this._localError=e;this._sessionPhase='error';this._sessionError=e.message||e.errMsg||'本机资料无法读取，请进入资料恢复';this.notifySession('error');throw e})
  this._localReady.catch(()=>{});return this._localReady
 },
 hasSession(){return this._sessionPhase==='ready'},
 requireSession(){return this.hasSession()},
 ensureSession(options={}){return options.retry&&this._sessionPhase==='error'?this.prepareLocal():this._localReady||this.prepareLocal()},
 updateUser(user,owner){if(owner!==this.globalData.token)return false;this.globalData.user=user;return true},
 scheduleVisit(){clearTimeout(this._visitTimer);this._visitTimer=setTimeout(()=>{if(this._foreground&&this.hasSession())require('./utils/rewards').visitForForeground().catch(()=>{})},800)}
})
