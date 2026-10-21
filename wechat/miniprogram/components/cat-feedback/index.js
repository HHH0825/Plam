const rewards=require('../../utils/rewards'),activity=require('../../utils/loading-activity')
const {setTabBarHidden}=require('../../utils/tab-bar')
const ROOTS=['pages/items/index','pages/ledger/index','pages/statistics/index','pages/me/index']
Component({
 data:{working:false,greetingOpen:false,capacityOpen:false,model:null,capacity:null,greetingArt:'',sunny:false},
 lifetimes:{
  attached(){
   this._visible=true
   this._unsub=rewards.subscribe((type,data)=>{
    if(type==='reset'){this.closeAll();this._owner='';return}
    if(type==='capacity'&&this._visible){wx.hideKeyboard?.();this.closeAll();this.setData({capacity:data,capacityOpen:true});this.tabHidden(true)}
   })
   this._unload=activity.subscribe(rows=>this.activity(rows));this.schedule(550)
  },
  detached(){this._visible=false;clearTimeout(this._probe);clearTimeout(this._loadingTimer);this._unsub?.();this._unload?.();this.tabHidden(false)}
 },
 pageLifetimes:{
  show(){this._visible=true;if(this._owner!==getApp().globalData.token){this.closeAll();this._owner=getApp().globalData.token}this.activity(activity.snapshot());this.schedule(550)},
  hide(){this._visible=false;clearTimeout(this._probe);clearTimeout(this._loadingTimer);this.closeAll()}
 },
 methods:{
  page(){const pages=getCurrentPages();return pages[pages.length-1]},
  tabHidden(hidden){const page=this._page||this.page();if(page)setTabBarHidden(page,hidden)},
  closeAll(){this.setData({greetingOpen:false,capacityOpen:false,working:false,model:null,capacity:null});this.tabHidden(false)},
  activity(rows){
   clearTimeout(this._loadingTimer)
   const token=getApp().globalData.token,page=this.page()
   const active=rows.some(r=>r.token===token&&!/^\/(membership|rewards\/greeting|rewards\/invitation|rewards\/visit|member\/(books|budget))/.test(r.path))
   if(!active||!this._visible){this.setData({working:false});return}
   this._loadingTimer=setTimeout(()=>{if(this._visible&&!page?.data.loading)this.setData({working:true})},220)
  },
  schedule(delay){clearTimeout(this._probe);this._probe=setTimeout(()=>this.probeGreeting(),delay)},
  safe(){
   const page=this.page(),app=getApp()
   if(!this._visible||!page||!ROOTS.includes(page.route)||!app.globalData.token||app._foreground===false||app._keyboardHeight)return false
   if(this.data.greetingOpen||this.data.capacityOpen)return false
   if(Object.entries(page.data||{}).some(([k,v])=>v&&(/(?:Open|Dialog|Sheet|Focus)$/.test(k)||['loading','busy','buying','saving','focusField','draftPrompt'].includes(k))))return false
   const bar=page.getTabBar?.();if(bar?.data?.menuOpen)return false
   return !activity.snapshot().some(r=>r.token===app.globalData.token)
  },
  async probeGreeting(){
   if(!this._visible)return
   const page=this.page()
   if(page?.route==='pages/editor/index'&&!page.itemId){
    if(page.data.draftPrompt||page.data.loading||page.data.busy||page.data.photoBusy||page.data.iconOpen||page.data.focusField||getApp()._keyboardHeight){this.schedule(600);return}
    const token=getApp().globalData.token
    try{const r=await rewards.load();if(this._visible&&token===getApp().globalData.token&&!r.capacity.can_add){if(page.data.draftPrompt||page.data.busy||page.data.focusField||getApp()._keyboardHeight){this.schedule(600);return}this.closeAll();this.setData({capacity:r.capacity,capacityOpen:true});this.tabHidden(true)}}catch(_){}
    return
   }
   if(!ROOTS.includes(page?.route))return
   if(!this.safe()){this.schedule(1000);return}
   const token=getApp().globalData.token,probe=this._attempt={}
   try{
    let m=await (rewards.forGreeting?rewards.forGreeting():rewards.load())
    if(rewards.visitIfNeeded)m=await rewards.visitIfNeeded(m)
    if(token===getApp().globalData.token&&this._visible&&this.page()?.route==='pages/me/index')this.page().setData({meSeeds:m.balance})
    if(this._attempt!==probe||token!==getApp().globalData.token||!this.safe())return
    const r=await rewards.mutate('greeting',{date:m.date})
    if(token!==getApp().globalData.token)return
    if(r.show&&(this._attempt!==probe||!this._visible||!this.safe())){
     if(r.delivery_token)await rewards.mutate('greeting',{date:r.date,not_shown:true,delivery_token:r.delivery_token})
     if(this._visible)this.schedule(1000)
     return
    }
    if(r.show){
     this._owner=token;this._page=this.page()
     this.setData({model:r,greetingArt:rewards.greetingArt(r.greeting.period),sunny:!['late','evening'].includes(r.greeting.period),greetingOpen:true,working:false})
     this.tabHidden(true)
    }
   }catch(_){/* Failed reads never display a fabricated reward or mark a local view. */}
  },
  keepOpen(){},
  closeGreeting(){this._attempt=null;this.setData({greetingOpen:false});this.tabHidden(false)},
  goCheckin(){this.closeGreeting();wx.navigateTo({url:'/pages/rewards/index'})},
  closeCapacity(){this.setData({capacityOpen:false});this.tabHidden(false)},
  goExpand(){this.closeCapacity();wx.navigateTo({url:'/pages/rewards/index'})},
  goMembership(){this.closeCapacity();wx.navigateTo({url:'/pages/membership/index'})}
 }
})
