// UI ownership stays stable during same-account credential renewal.
const copy=v=>JSON.parse(JSON.stringify(v||{}))
function wrap(base){
 if(base.sessionPublic||typeof getApp!=='function'||typeof getApp()?.ensureSession!=='function')return base
 const initial=copy(base.data)
 const ready=p=>typeof getApp().ensureSession!=='function'||getApp().hasSession()&&getApp()._sessionPhase!=='connecting'
 function resume(p){
  if(p._sessionAlive===false||!p._sessionVisible||!ready(p)||(p._sessionGeneration||0)!==(getApp()._sessionGeneration||0))return
  p.setData({sessionBlocked:false,sessionBusy:false,sessionError:'',entryBlocked:false})
  if(!p._sessionLoaded){p._sessionLoaded=true;base.onLoad?.apply(p,p._sessionLoadArgs||[])}
  if(p._sessionShowPending){p._sessionShowPending=false;base.onShow?.apply(p,p._sessionShowArgs||[])}
  for(const key of ['onReady','onRouteDone'])if(p['_sessionPending'+key]){p['_sessionPending'+key]=false;base[key]?.call(p)}
  p.getTabBar?.()?.sync?.()
 }
 function connect(p,retry=false){
  const app=getApp();if(typeof app.ensureSession!=='function'){resume(p);return}
  const job=p._sessionJob={};p.setData({sessionBlocked:true,entryBlocked:!p._sessionLoaded,sessionBusy:app._sessionPhase!=='error'||retry,sessionError:retry?'':app._sessionError||''})
  app.ensureSession({retry}).then(()=>{if(p._sessionJob===job)resume(p)},e=>{if(p._sessionAlive&&p._sessionJob===job)p.setData({sessionBusy:false,sessionError:e.message||'连接失败，点击重试'})})
 }
 return {...base,data:{...base.data,sessionBlocked:true,sessionBusy:true,sessionError:'',entryBlocked:true,sessionHome:false},
  onLoad(...args){
   this._sessionAlive=true;this._sessionGeneration=getApp()._sessionGeneration||0;this.setData({sessionHome:this.route==='pages/items/index'});this._sessionLoadArgs=args;this._sessionLoaded=false
   const app=getApp();this._sessionUnsubscribe=app.subscribeSession?.(event=>{
    if(!this._sessionAlive)return
    if(event==='connecting'){this.store?.();this.captureSessionDraft?.();this.setData({sessionBlocked:true,sessionBusy:true,sessionError:''});this.getTabBar?.()?.setData?.({hidden:true,menuOpen:false})}
    if(event==='error')this.setData({sessionBlocked:true,sessionBusy:false,sessionError:app._sessionError||'连接失败，点击重试'})
    if(event==='changed'){this.store?.();this.captureSessionDraft?.();if(this._sessionLoaded){base.onHide?.call(this);base.onUnload?.call(this)}this._sessionLoaded=false;this.setData({...copy(initial),sessionBlocked:true,sessionBusy:true,entryBlocked:true})}
    if(event==='ready'&&(this._sessionGeneration||0)===(app._sessionGeneration||0)){this.setData({sessionBlocked:false,sessionBusy:false,sessionError:'',entryBlocked:false});resume(this)}
   })
   if(ready(this)){this._sessionLoaded=true;return base.onLoad?.apply(this,args)}
   this.setData({entryBlocked:true});connect(this)
  },
  onShow(...args){if(this._sessionAlive===undefined)this._sessionAlive=true;this._sessionVisible=true;this._sessionShowPending=true;this._sessionShowArgs=args;if(ready(this))resume(this);else connect(this)},
  onReady(...args){if(this._sessionLoaded)return base.onReady?.apply(this,args);this._sessionPendingonReady=true},
  onRouteDone(...args){if(this._sessionLoaded)return base.onRouteDone?.apply(this,args);this._sessionPendingonRouteDone=true},
  onHide(...args){this._sessionVisible=false;if(this._sessionLoaded)return base.onHide?.apply(this,args)},
  onUnload(...args){this._sessionAlive=false;this._sessionJob=null;this._sessionUnsubscribe?.();if(this._sessionLoaded)return base.onUnload?.apply(this,args)},
  retrySession(){if(!this.data.sessionBusy)connect(this,true)}
 }
}
module.exports={wrap}
