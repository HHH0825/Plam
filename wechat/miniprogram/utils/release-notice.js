const content=require('./release-notice-content'),motion=require('./member-announcement-motion')
const {serviceScope}=require('./cloud-transport'),{setTabBarHidden}=require('./tab-bar')
const seen=new Set()
function valid(value){return !!(value&&typeof value.id==='string'&&/^[A-Za-z0-9._-]{1,64}$/.test(value.id)&&typeof value.title==='string'&&value.title.trim()&&value.title.length<=80&&Array.isArray(value.paragraphs)&&value.paragraphs.length&&value.paragraphs.length<=20&&value.paragraphs.every(p=>typeof p==='string'&&p.trim()&&p.length<=2000))}
function key(app,value){const id=app.globalData.user?.id;return valid(value)&&id!==undefined&&id!==null&&id!==''&&app.globalData.token?'palmUpdateNotice:v1:'+serviceScope()+':'+id+':'+value.id:''}
function prepare(page){
 const app=getApp(),identity=key(app,content),token=app.globalData.token
 if(page._announcementKey!==identity||page._updateToken!==token){motion.cancel(page);page._announcementKey=identity;page._updateToken=token;page.setData({announcementOpen:false,updateNotice:null,updateNoticeUnread:false})}
 let read=seen.has(identity)
 if(identity&&!read)try{read=wx.getStorageSync(identity)===true}catch(_){}
 if(identity&&read)seen.add(identity)
 page.setData({updateNotice:identity?content:null,updateNoticeUnread:!!identity&&!read})
}
function current(page,identity,token){return page._visible&&identity&&identity===page._announcementKey&&identity===key(getApp(),content)&&token===getApp().globalData.token}
function hide(page){page.setData({announcementOpen:false});setTabBarHidden(page,false)}
function wrap(base){return {...base,
 data:{...base.data,updateNotice:null,updateNoticeUnread:false,announcementOpen:false,announcementBusy:false,announcementClosing:false,announcementFading:false,announcementFlightStyle:'',announcementPulse:false},
 onShow(...args){this._visible=true;prepare(this);const result=base.onShow?.apply(this,args);if(!getApp().globalData.token)prepare(this);return result},
 onHide(...args){this._visible=false;motion.cancel(this);hide(this);return base.onHide?.apply(this,args)},
 onUnload(...args){this._visible=false;motion.cancel(this);hide(this);return base.onUnload?.apply(this,args)},
 openFilters(...args){if(!this.data.announcementOpen)return base.openFilters?.apply(this,args)},
 openUpdateNotice(){
  prepare(this)
  const f=this.selectComponent?.('#cat-feedback')?.data,app=getApp()
  if(!this._visible||!this.data.updateNotice||this.data.announcementOpen||this.data.filterOpen||this.data.busy||this.data.searchFocus||app._keyboardHeight||f?.greetingOpen||f?.capacityOpen||this.getTabBar?.()?.data?.menuOpen)return
  const identity=this._announcementKey,token=app.globalData.token
  this.setData({announcementOpen:true},()=>{
   if(!current(this,identity,token)||!this.data.announcementOpen)return
   seen.add(identity);this.setData({updateNoticeUnread:false});try{wx.setStorageSync(identity,true)}catch(_){}
  })
  setTabBarHidden(this,true)
 },
 closeUpdateNotice(){let reduced=false;try{reduced=!!wx.getSystemSetting?.().reducedMotion}catch(_){}motion.close(this,()=>hide(this),{fadeFallback:true,reducedMotion:reduced})},
 ignoreUpdateNoticeTouch(){},
 updateNoticeIconFailed(){this.setData({updateNoticeIconError:true})}
}}
module.exports={wrap,valid}
