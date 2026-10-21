// Keep the default tab URL without mounting its private content before login.
function wrap(definition){
 const page={...definition,data:{...definition.data,entryBlocked:true},retryLogin(){getApp().requireSession()}}
 for(const key of ['onLoad','onShow','onReady','onRouteDone','onHide','onUnload']){
  page[key]=function(...args){
   if(key==='onLoad'){
    this._entryBlocked=!getApp().hasSession();this.setData({entryBlocked:this._entryBlocked})
   }
   // onReady can precede completion of the native launch route animation.
   if(this._entryBlocked){if(key==='onRouteDone')getApp().requireSession();return}
   return definition[key]?.apply(this,args)
  }
 }
 return page
}
module.exports={wrap}
